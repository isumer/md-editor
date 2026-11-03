# Architecture

Status: **proposed** (2026-11-04), to be reviewed before slice 3 starts.
PLAN.md says *what* the product does and the budgets it must meet; this
document says *how the code is shaped* so that fourteen slices land on one
structure instead of fourteen patches. Decisions with alternatives and
reversal conditions are in [`adr/`](adr/).

## 1. Forces

The design is driven by, in order:

1. **Never freeze, never lose data** — the UI thread and the main process
   must stay idle enough to answer input within a frame; a write is either
   complete or absent.
2. **Hostile documents** — a file is untrusted input; the renderer is
   sandboxed and the preview is sanitised.
3. **Notepad++ breadth** — ~100 commands, two views, macros, many panels.
   Without a shared command and state model this becomes a tangle.
4. **Large files** — work proportional to the change, not the document.
5. **Testability** — every boundary has a port with a fake, so tests never
   mock the unit under test.

## 2. Processes and threads

```
┌──────────────── main process (Node) ────────────────┐
│ App shell: windows, menus, dialogs, single-instance, │
│ shell integration, updater. Thin: routes, never     │
│ computes. No loop over files, no hashing, no regex. │
│  services: File · Settings · Session · Shell · Export│
└───────┬───────────────────────────────┬─────────────┘
        │ typed IPC (validated)          │ MessagePort
┌───────┴──────────────┐      ┌──────────┴─────────────────┐
│ renderer (sandboxed) │      │ utility process "io-worker" │
│ UI + editor + state  │      │ (Electron utilityProcess)   │
│  ├ render worker     │      │ Workspace tree · Watcher ·  │
│  ├ diff/merge worker │      │ Find/Replace in Files ·     │
│  └ regex worker      │      │ Folder compare · hashing    │
└──────────────────────┘      └─────────────────────────────┘
```

- **Main is a router.** Anything that can take more than a few
  milliseconds or scales with the number of files runs in the
  **io-worker utility process**. If main blocks, menus, dialogs and every
  window freeze — so main may not iterate directories, hash, or search
  ([ADR-0004](adr/0004-utility-process-for-io.md)). The renderer talks to
  the io-worker over a `MessagePort` brokered by main, so streamed results
  (search hits, tree batches) do not pass through main at all.
- **Renderer workers** take CPU work off the UI thread: Markdown render
  (exists), diff/merge, user regexes with a time limit.
- Crash containment: an io-worker or renderer-worker crash is detected,
  restarted, and its in-flight requests fail with a typed error. It never
  takes the window down.

## 3. Source layout and dependency rule

```
src/
  shared/            pure types + validators; imported by everyone, imports nothing
    ipc/             one file per service contract (channel, request, response, errors)
    model/           value types: DocumentId, TextEncoding, Eol, Settings schema…
  main/
    app/             lifecycle, windows, menus, single-instance, shell integration
    services/        File, Settings, Session, Export, Shell — each behind a port
    ipc/             handler registration: validate → service → Result
    platform/        thin adapters: fs, dialog, shell, clock (the only real I/O)
  io-worker/
    services/        Workspace, Watch, Search, FolderCompare
    platform/        fs adapter (same port as main's)
  preload/           exposes window.api — generated from shared/ipc, nothing else
  renderer/
    core/            NO DOM. Document model, tab/view model, command registry,
                     keymap, macro recorder, selection of language, settings store
    features/        one folder per feature (preview, sidebar, search, compare,
                     merge, power-tools…): UI + feature logic, talks to core
    ui/              shared components (tab bar, tree, virtual list, dialogs)
    platform/        window.api client, worker clients
    workers/         render, diff, regex (pure functions + a thin message shell)
```

**Rules, enforced by lint (`no-restricted-imports`) in the quality job:**

- `shared` imports nothing from the project.
- `renderer/core` imports only `shared` — no DOM, no CodeMirror view, no
  `window.api`; it is plain logic and unit-tested with 95 % coverage.
- `renderer/features/X` may import `core`, `ui`, `platform`, `shared` — but
  not another feature. Features talk through commands and core events.
- Workers import only their pure modules and `shared`.
- `main` and `io-worker` never import `renderer`, and vice versa. Every
  crossing is an IPC contract in `shared/ipc`.
- Only `*/platform/` touches `fs`, `dialog`, `shell`, the clock or
  `window.api`. Everything else receives a port and gets a fake in tests.

## 4. The document model (renderer/core)

The central decision ([ADR-0006](adr/0006-document-model.md)):

- A **Document** owns the text: id, path (or untitled n), encoding, line
  ending, language, read-only flag, saved version, and the **one
  CodeMirror `EditorState`** that is the source of truth (undo history
  lives there).
- A **Tab** points at a Document. A **View** (1 or 2) has an ordered list
  of tabs and an active tab. A cloned tab is a second Tab on the same
  Document in the other View.
- An **Editor surface** (CodeMirror `EditorView`) is attached to whichever
  tab is visible; switching tabs swaps the state into the view rather
  than creating one. Two visible tabs of one Document share the Document's
  state through CodeMirror's split-view pattern (one owner, the other
  forwards transactions with an annotation).
- **Dirty** = current doc version ≠ saved version, so undoing back to the
  saved text clears the marker (Notepad++ behaviour).
- **Preview** is a projection of a Document: block cache keyed by chunk
  hash, owned by the preview feature, evictable (LRU budget).

```
Workspace ─┬─ View[0] ─ Tab* ─┐
           └─ View[1] ─ Tab* ─┴─▶ Document ─▶ EditorState (text, undo)
                                       └────▶ PreviewCache (blocks)
```

## 5. Commands, keys, menus, macros

Every user action is a **command** registered once:
`{ id: "edit.duplicateLine", title, when?, run(ctx, args) }`.

- Menus, the command palette, keybindings, toolbar buttons, context menus
  and tests all invoke commands by id. No feature wires its own
  `keydown` handler or menu click.
- **Keymap** maps chords to command ids per platform; user overrides are
  data in settings. Notepad++ defaults on Windows.
- **Macros** record the sequence of command invocations plus typed text
  (as editor transactions), so playback goes through the same path as a
  user — no separate macro engine.
- Native menus are built in main from a **menu model** the renderer sends
  (ids, labels, enabled/checked state); a click sends the id back. This
  keeps one source of truth and lets e2e drive menus by id.
- `when` clauses (e.g. `editorFocus && languageId == markdown`) decide
  enablement, evaluated in core.

## 6. State and UI

- Core state lives in a small set of **stores** (workspace, documents,
  settings, ui-layout) with explicit actions; features subscribe to
  slices. No component mutates state directly.
- UI components use **SolidJS** ([ADR-0003](adr/0003-ui-framework.md)):
  fine-grained reactivity updates only the DOM nodes that depend on a
  changed value, no virtual-DOM diff on every keystroke, ~7 KB. The
  editor and preview DOM are *not* owned by Solid — CodeMirror and the
  preview block patcher manage their own subtrees.
- Large lists (sidebar tree, search results, folder compare) use one
  shared virtual list component.

## 7. IPC contracts

- One contract file per service in `shared/ipc/`: channel names, request
  and response types, error codes, and a **validator** for each request.
  Main validates every request at the boundary (shape, sizes, path
  rules) — the renderer is treated as untrusted
  ([ADR-0007](adr/0007-ipc-contracts.md)).
- Responses are `Result<T, ServiceError>`; handlers never throw across IPC.
  `ServiceError = { code, message, retryable }` — stable codes, no stack
  traces or host paths beyond the file the user chose.
- Streams (search hits, tree batches, compare results) use MessagePorts
  with backpressure (the consumer acks batches) and cancellation.
- `event.senderFrame` is checked on every handler.
- The preload API is generated from the contracts, so a channel cannot
  exist in main without being typed in shared.

## 8. File I/O and safety

- **FileService** (main) is the only writer: atomic write (exists),
  per-path write queue (exists), encoding encode/decode, EOL handling,
  conflict check (file changed on disk since load → typed
  `CONFLICT` error, the UI offers reload/overwrite).
- **Path policy** in one module: canonicalise, reject device names / ADS
  / UNC where not allowed, confine workspace operations to roots
  (symlink-resolved). Every service that takes a path goes through it.
- **Drafts and session** (SessionService) write via the same atomic path,
  throttled by size.

## 9. Errors, logging, crash handling

- Three choices at every catch: propagate, translate (keeping `cause`),
  or handle — written on the catch line.
- Structured log lines (`event`, ids, `code`, `retryable`), never document
  content or credentials; rotated log file in the profile (or `data\` in
  portable mode). The crash-free CI gate reads this log.
- Renderer crash → main reloads the window and SessionService restores
  tabs + drafts. io-worker crash → restarted, requests fail with
  `WORKER_RESTARTED`.

## 10. Settings and persistence

- One versioned schema in `shared/model/settings.ts` with defaults and a
  validator; unknown keys preserved (an older build does not erase a
  newer build's settings); migrations are pure functions `vN → vN+1`,
  unit-tested both ways.
- Storage location chosen once at startup: profile dir, or `data\` beside
  the executable in portable mode.

## 11. How the existing code moves

Slice 1's code maps onto this without a rewrite:

| Today | Moves to |
|---|---|
| `main/atomicWrite.ts` | `main/services/file/atomicWrite.ts` |
| file handlers in `main/main.ts` | `main/services/file/` + `main/ipc/file.ts` |
| menu in `main/main.ts` | `main/app/menu.ts` built from the renderer's menu model |
| `renderer/app.ts` | split into `core/` (document, commands), `features/preview`, `features/editor`, `platform/api` |
| `renderer/render.ts`, `render.worker.ts` | `renderer/workers/render/` |
| `shared/api.ts` | `shared/ipc/file.ts` + `shared/ipc/result.ts` |

The move happens in **slice 3** as a behaviour-preserving refactor before
any new feature, with the existing e2e suite as the safety net, and the
import rules switched on in the same slice so the structure cannot erode.

## 12. Open questions for review

1. SolidJS vs. plain DOM + small helpers (ADR-0003) — Solid is proposed.
2. One io-worker vs. one per service — one is proposed (fewer processes,
   simpler lifecycle); revisit if a service's load starves another.
3. Multiple windows: v1 keeps one window per instance (two views inside
   it). The model allows N windows later (Workspace per window).
