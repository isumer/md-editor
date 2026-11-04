# Architecture

Status: **accepted, revision 3** (2026-11-04). Two review rounds by the
architect agent (round 1: two blockers; round 2: no blockers, four
major). This revision applies every finding of both rounds; the review and how each finding was
resolved are in [`reviews/2026-11-04-architecture.md`](reviews/2026-11-04-architecture.md).
PLAN.md says *what* the product does and the budgets it must meet; this
document says *how the code is shaped*. Decisions with alternatives and
reversal conditions are in [`adr/`](adr/).

## 1. Forces

1. **Never freeze, never lose data** — the UI thread and main must answer
   input within a frame; a write is complete or absent; there is exactly
   one writer per file.
2. **Hostile documents** — a file is untrusted input; the renderer is
   sandboxed, the preview sanitised, and a compromised renderer still
   cannot touch files the user did not choose.
3. **Notepad++ breadth** — ~100 commands, two views, macros, panels.
4. **Large files** — work proportional to the change, not the document.
5. **Testability** — every boundary has a port with a fake.

Non-goals for v1: a plugin system or plugin seams; multiple windows
(but nothing may assume a single window — §12).

## 2. Processes and threads

```
┌──────────── main process ────────────┐
│ app shell: windows, menu skeleton,   │
│ dialogs, single-instance, open-file, │
│ shell integration, updater           │
│ GRANTS: issues capabilities for      │
│ paths the user chose (§7)            │
└──┬──────────────────────────┬────────┘
   │ IPC (validated,           │ control channel
   │ senderFrame-checked)      │ (grants, roots, settings)
┌──┴───────────────────┐   ┌───┴──────────────────────────────┐
│ renderer (sandboxed) │   │ io-worker (Electron utilityProc.) │
│ UI, editor, state    │◀═▶│ FileService: ALL reads/writes,    │
│  workers:            │ MP│   codec, queue, fingerprints      │
│  ├ render (mirror)   │   │ Workspace tree · Watcher          │
│  ├ diff/merge        │   │  worker_threads (per job, kill-   │
│  └ regex             │   │  able): Search · Hash/Compare     │
└──────────────────────┘   └───────────────────────────────────┘
          ═▶ MP = MessagePort, issued by main to the verified main frame
```

- **Main is a router and a gatekeeper.** It shows dialogs, resolves
  argv / `open-file` / drag-drop, and turns each user-chosen path into a
  **grant** (§7). It does no file I/O on document content, no encoding,
  no hashing, no directory walks ([ADR-0004](adr/0004-utility-process-for-io.md)).
- **io-worker** owns every file read and write ([ADR-0008](adr/0008-file-ownership.md)):
  open, save, drafts, encoding/EOL codec, per-path write queue, disk
  fingerprints, conflict detection, workspace tree, watcher. CPU-heavy or
  user-regex work (Find/Replace in Files, folder-compare hashing) runs in
  **worker_threads owned by the io-worker, one per job, killed on cancel
  or after the time limit**, so a runaway regex never stalls the tree or
  the watcher.
- **Renderer workers**: render (keeps a mirror of each previewed
  document, §4.3), diff/merge, regex (in-file find with a user regex,
  smart-highlight scans over large documents). CodeMirror's built-in
  search cursor is used directly only for plain-text find on documents
  under 1 MB.
- **Export window** (PDF): a separate hidden `BrowserWindow`, no preload,
  `sandbox`, `contextIsolation`, JavaScript disabled, CSP `default-src
  'none'; style-src 'unsafe-inline'; img-src doc-asset:`, navigation and
  window-open denied; it loads already-sanitised HTML and is destroyed
  after `printToPDF`.
- **Startup sequence**: main creates the BrowserWindow and spawns the
  io-worker in parallel; the menu skeleton is set immediately; the
  renderer paints, then its first open waits for port readiness. An argv
  file must be editable inside the cold-start budget (test).
- **Crash containment**: io-worker, its job threads and renderer workers
  are supervised; a crash restarts them and fails in-flight requests with
  `WORKER_RESTARTED`. A renderer crash reloads the window (§10).

## 3. Source layout and dependency rule

```
src/
  shared/          pure types, validators, message keys; imports nothing
    ipc/           one contract per service (§7)
    model/         value types: DocumentId, Grant, TextEncoding, Eol, Settings
    replication/   mirror state machine (ADR-0009), generic over the text type
  node-shared/     Node-only code shared by main and io-worker:
                   path policy, fs port, atomic write
  main/
    app/           lifecycle, windows, menu skeleton, open-file, single-instance
    grants/        capability issuing and checking
    ipc/           handler registration (validate → service → Result)
    services/      Settings, Session index, Export, Shell integration, Updater
    platform/      electron/dialog/shell/clock adapters
  io-worker/
    services/      File, Workspace, Watch, Search, FolderCompare
    jobs/          worker_thread entry points (search, hash)
    platform/      fs adapter
  preload/         window.api built from a FIXED list of contracts
  renderer/
    core/          no DOM; may import @codemirror/state only
                   documents, tabs, views, commands, context keys, keymap,
                   macro recorder, stores (framework-free observables)
    editor/        CodeMirror view setup, extensions, view-state attach/detach
    features/      one folder per feature; UI + feature logic
    ui/            shared Solid components (tab bar, tree, virtual list, dialogs)
    platform/      api client, worker clients, io-worker port client
    workers/       render, diff, regex
```

Allowed dependencies (→ = may import):

| From | May import |
|---|---|
| shared | nothing in the project |
| node-shared | shared |
| main, io-worker | shared, node-shared, own subfolders |
| preload | electron, shared/ipc |
| renderer/core | shared, `@codemirror/state` |
| renderer/editor | core, shared, `@codemirror/*` |
| renderer/features/X | core, editor, ui, platform, shared, `solid-js` — **not another feature** |
| renderer/ui | core, shared, `solid-js` |
| renderer/platform | core, shared |
| renderer/main.ts (composition root) | everything in renderer — wires platform adapters into core ports |
| renderer/workers | shared, their own pure modules, `markdown-it`, `highlight.js`, `@codemirror/state` |

Worker request/response types live in `shared/workers/`, not in the
worker modules.

Enforced by **dependency-cruiser** (path rules, cycles, dynamic imports)
plus `@typescript-eslint/no-restricted-imports` for package bans (`node:*`
and `electron` in the renderer, `@codemirror/view` in core, `solid-js/web`
in core). A planted violation per rule is part of the check-red suite.

Features cooperate only through **typed command contracts** declared in
core (`commands.ts`: id constants + argument types) and core events.

## 4. Documents, tabs, views

### 4.1 Model ([ADR-0006](adr/0006-document-model.md))
- **One Document per canonical path per app** (canonical =
  `fs.realpath.native`, on-disk casing, computed in the io-worker; the
  app-wide path registry lives in main). Opening a path that is open
  focuses its tab; a second window asking for it gets the existing one
  (§12). Untitled documents have synthetic ids.
- A Document owns: grant, path, encoding, EOL, language, read-only flag,
  **diskFingerprint** (mtime, size, content hash), **savedText** (the
  `Text` at last load/save), and the **authoritative `EditorState`
  including undo history**.
- A **Tab** points at a Document and owns its **view-state**: selection,
  scroll anchor, folds, per-tab word wrap. A **View** (1 or 2) owns an
  ordered list of tabs. Clones, compare panes and merge panes are all
  just more tabs/panes attached to Documents; no surface ever owns the
  text.
- Visible editors apply Document transactions and keep their own
  selection; edits from any surface go through the Document, which
  broadcasts them (same frame) to every attached surface. Closing a tab
  never affects history.
- **Dirty** = text differs from `saved.text` (`Text.eq`, which
  short-circuits on shape and shared subtrees) **or** encoding / EOL /
  BOM differ from `saved`; evaluated at most once per frame. Undoing back
  to the saved text clears dirty; converting line endings sets it.
- **External change**: the watcher reports a new fingerprint → clean
  document: reload as an annotated transaction (one undo step, keeps
  dirty=false); dirty document: conflict banner (Reload / Keep mine /
  Compare).
- **Multi-file writes** (Replace in Files, merge Apply, folder copy) to a
  path with an open Document are applied **as a transaction on that
  Document** (one undo step, tab becomes dirty), never written behind its
  back. Paths without an open Document are written by FileService.
- **Replace in Files** searches open Documents in their buffer and other
  files on disk; apply recomputes any file whose version or fingerprint
  changed since the preview and shows it again (ADR-0008).

### 4.2 Compare and merge
Compare/merge panes attach to Documents (the files compared) or to
read-only scratch Documents (clipboard, base, LOCAL/REMOTE). Accepting a
chunk is a transaction in the target Document; "apply all
non-conflicting" is one transaction. `git mergetool` MERGED is a normal
Document. Whether `@codemirror/merge` can consume worker-computed chunks
is verified by a spike at the start of the compare slice (ADR-0002
reversal condition).

### 4.3 Text replication ([ADR-0009](adr/0009-text-replication.md))
No whole-document string crosses a thread per keystroke. Each consumer
(render worker, regex worker, draft writer) holds a **mirror** of the
documents it needs and receives `ChangeSet` deltas tagged with the
document version; a full copy is sent only on attach or on version
mismatch (resync). Drafts are serialised from a mirror off the UI
thread. A test asserts no `doc.toString()` on the UI thread per edit.

## 5. Commands, keys, menus, macros ([ADR-0005](adr/0005-command-registry.md))
- Every action is a command `{ id, titleKey, when?, run(ctx, args,
  target) }`. `target` names what was clicked (tab, view, tree node);
  context keys (`editorFocus`, `sidebarFocus`, `compareFocus`,
  `languageId`, `hasSelection`…) are contributed by features to a core
  context-key service and evaluated by `when`.
- **Menus**: main owns a static **skeleton** that works with no renderer
  (macOS app menu: About, Settings ⌘,, Services, Hide, Quit; File > Quit;
  Edit roles; Window and Help roles). The renderer contributes item
  lists and state; pushes are coalesced to at most one per 100 ms,
  patched in place (`enabled`/`checked`) and rebuilt only when structure
  changes. Budget: a push costs < 2 ms in main.
- **Keys**: the renderer keymap owns all chords; menu items display their
  chord with `registerAccelerator: false`. Exceptions: OS-native roles
  (macOS ⌘Q/⌘H/⌘M, Edit-menu roles for IME and Services). Matching uses
  `event.key` with modifiers; on Windows, `Ctrl+Alt+<key>` that produces a
  character (AltGr on Turkish, Polish, German layouts) is text input and
  never a command; default bindings avoid Ctrl+Alt chords for this reason.
- **Macros** record command invocations, with typing recorded as
  `editor.insertText(text)` relative to the selection (Notepad++
  semantics). "Play to end of file" runs in cancellable, yielding batches.
- **i18n**: titles are message keys in a catalog (`shared/messages/en.ts`)
  from the first command; English is the only catalog in v1.

## 6. State and UI ([ADR-0003](adr/0003-ui-framework.md))
- Core stores are framework-free observables with explicit actions.
- UI uses **SolidJS**; adapters in `ui/` turn core observables into
  signals. Solid never owns the CodeMirror or preview DOM.
- One shared virtual list, ARIA-complete (`aria-rowcount`,
  `aria-setsize`/`aria-posinset`, roving focus).

## 7. IPC, grants and trust boundaries ([ADR-0007](adr/0007-ipc-contracts.md))
- **Grants**: main issues opaque, unguessable handles only for paths that
  came from a dialog, argv, `open-file`, drag-drop, or lie inside a root
  the user granted (Open Folder). `DocumentGrant` (one file) and
  `RootGrant` (a folder, confined, symlink-resolved). Every service takes
  a grant, never a raw path. Today's `saveDocument` accepting any
  renderer-supplied path is replaced by this.
- **Two validation boundaries**: main validates every IPC request and
  checks `event.senderFrame` is the window's own top frame; the
  io-worker validates every port message with the same validators and
  resolves grants against the table main pushed to it on the **control
  channel** (the renderer can present a grant, never create one).
- **Port lifecycle**: one MessagePort per webContents, sent with
  `webContents.postMessage` to the verified main frame only, held inside
  the preload behind per-operation functions (never handed to page
  script), closed and re-issued on reload or `render-process-gone`.
- **Preload** is built from a fixed list of contracts; it exposes
  per-operation functions and never accepts a channel name.
- Results are `Result<T, ServiceError>`, `ServiceError = { code,
  messageKey, retryable }`; streams use ports with acknowledged batches
  and cancellation.

## 8. Asset protocol and origins ([ADR-0010](adr/0010-asset-protocol.md))
- The app loads from a privileged custom scheme `app://` (not `file://`),
  so CSP `'self'` means the app bundle only.
- Document images use `doc-asset://<grant>/<relative path>`, served by the
  io-worker FileService through the path policy (inside the document's
  folder tree; no UNC, no `..` escape). `file:` is removed from the CSP:
  a `file://host/share` image can leak NTLM credentials on Windows.
- Remote images follow the always / ask / never setting (PLAN).

## 9. File I/O and safety ([ADR-0008](adr/0008-file-ownership.md))
- FileService in the io-worker: atomic write, per-path queue, codec
  (encoding detection/encode/decode, EOL), fingerprints, conflict check
  (`CONFLICT` when disk ≠ document's fingerprint at save), drafts.
- Path policy in `node-shared`: canonicalise, reject device names / ADS /
  unexpected UNC, confine to roots after realpath.

## 10. Errors, logging, crashes, recovery
- Three choices at every catch: propagate, translate (keep `cause`), or
  handle — written on the catch line.
- Structured log (`event`, ids, `code`, `retryable`), no document
  content; rotated file in the profile or portable `data\`. The CI
  crash-free gate reads it.
- **Recovery point**: drafts every 2 s idle (10 s above 5 MB) — a renderer
  crash loses at most that window of typing; stated in the docs.

## 11. Settings, updater, accessibility
- Versioned settings schema with defaults and validator; unknown keys
  preserved; pure migrations tested both ways. Main owns settings and
  pushes changes to the io-worker on the control channel (ignore lists,
  encoding defaults).
- Updater (if enabled): signed artifacts only, staging in a user-owned
  directory, never in portable mode.
- Accessibility: F6 cycles panes, F8 switches views; tablist/tree roles;
  dirty and conflict states announced; when a screen reader is detected
  (Chromium accessibility mode) preview virtualisation is turned off for
  documents up to 2,000 blocks; above that it stays on and a notice
  points to the editor, which is fully accessible text — never a freeze.

## 12. Windows
v1 opens one window per instance, but every main service, grant table,
io-worker port and session record is **keyed by window id**, and the
one-Document-per-path rule is app-wide, so a second window is an
additive change.

## 13. Migration of slice 1 code
Each step is a PR-sized change with the full suite green before the next.

- **3.0 — characterisation tests**, phrased at the **contract level** so
  they survive moving between processes ("the file-save contract rejects
  a payload without text", not "main rejects…"), each shown red against
  a broken build: Save As; save of an untitled document goes to a
  dialog; cancelled dialog changes nothing; open/read failure shows
  status and keeps the document; an edit during an in-flight save stays
  dirty; a render error keeps the last good preview; menu items dispatch
  Open / Save / Save As; invalid save payload rejected; `openExternal`
  scheme rejection.
- **3a — pure move** into the §3 layout; same contracts, channel names
  and menu; dependency-cruiser rules on.
- **3b — contracts and grants**: shared/ipc, Result/ServiceError, fixed
  preload, senderFrame checks, grant protocol (ADR-0007) — FileService
  still in main.
- **3c — io-worker**: spawn, port lifecycle, FileService and atomic write
  move there, save-by-version and mirrors (ADR-0008/0009); open/save
  latency measured before and after; startup sequence test.
- **3d — origins and security baseline**: `app://`, `doc-asset://`
  (ADR-0010), the security tests from PLAN "Security testing".
- **3e — commands**: registry, context keys, keymap ownership incl.
  Undo/Redo, menu skeleton + contributions, message keys (ADR-0005).

Quality gates, e2e coverage merge, test-integrity checks and Stryker
switch on in the step where they first apply (lint and boundaries in
3a, coverage merge in 3c, Stryker once core logic exists).
