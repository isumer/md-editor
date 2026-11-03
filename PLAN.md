# MD Editor — plan

A standalone Markdown editor for Windows and macOS. The overriding
requirement is that it is **fast and never freezes or crashes**; every
feature below is subordinate to that.

## Requirements (from the user, 2026-11-04)

| # | Requirement | Acceptance |
|---|---|---|
| R1 | Editor and preview side by side | Split view with a draggable divider |
| R2 | Either pane full screen on its own | View modes: split / editor only / preview only, plus OS full screen |
| R3 | Scroll together | Scrolling either pane keeps the same source block at the top of the other |
| R4 | Several files open | Tabs; each keeps its own text, undo history, cursor and scroll |
| R5 | Save | Save, Save As, dirty marker, prompt on close with unsaved changes |
| R6 | Export preview | HTML (self-contained) and PDF, matching what the preview shows |
| R7 | Background colour | User-chosen background for editor and preview, persisted |
| R8 | Themes | Light, dark, follow system |
| R9 | Windows + macOS | Installers for both from CI |
| R10 | Fast, stable | See "Stability budget" — measured, not asserted |
| R11 | Workspace sidebar | Open a folder; the left panel lists its folders and `.md` files as a tree; click opens in a tab; toggle the panel; updates when files change on disk |

## Stack and why

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron 45 | Same Chromium on Windows and macOS, so the preview and the PDF render identically on both. `webContents.printToPDF` gives a real PDF of the real preview. VS Code's Markdown preview runs on this stack. Tauri was rejected: it uses WKWebView on macOS and WebView2 on Windows — two engines, two sets of print/PDF behaviour. |
| Editor | CodeMirror 6 | Virtualised rendering: only visible lines are in the DOM, so a 5 MB file edits as fast as a 5 KB one. |
| Markdown | markdown-it 15 (GFM: tables, task lists, strikethrough, linkify) | Same parser as VS Code; tokens carry source line maps, which sync scroll needs. |
| Sanitising | DOMPurify | Raw HTML in a document must not run script in the app. |
| Code highlight | highlight.js | Runs inside the render worker, off the UI thread. |
| Build | Vite (renderer) + tsc (main, preload), TypeScript 6 | |
| Packaging | electron-builder | NSIS + portable for Windows, DMG (universal) for macOS. |
| Tests | Vitest (logic), Playwright `_electron` (end to end) | |

All versions pinned exactly in `package.json`; `package-lock.json` committed.

## Why the previous (Python) editor froze — and the rule against each cause

The earlier attempt's source is not on disk; these are the usual causes of
that symptom, each closed by a rule here:

1. **Re-rendering the whole preview on the UI thread per keystroke.**
   → Markdown is parsed in a **Web Worker** and a stale result is dropped
   (render ids). The UI thread only patches the changed blocks — see
   "Preview pipeline".
2. **Whole-document text widget.** → CodeMirror 6 virtualises lines.
3. **Synchronous file / IPC calls.** → No `sendSync`, no `*Sync` fs calls
   in the main process after startup. All IPC is `invoke`/`handle`.
4. **Unhandled exception kills the app.** → Every IPC handler wraps its
   work and returns a typed error; the renderer shows it. A crashed or
   hung renderer (`render-process-gone`, `unresponsive`) is reported and
   the window reloaded with the recovered drafts.
5. **Preview errors (seen in VS Code: blank or stuck preview).** → A
   render that throws keeps the last good preview and shows an error
   badge with the message; the next edit retries. A worker that crashes
   is restarted and the current text re-rendered. A render running longer
   than 2 s is treated as hung: the worker is terminated, restarted, and
   the badge says the document is too complex rather than freezing. A
   broken image or link never affects the rest of the preview.
6. **Torn save on power loss / crash.** → Atomic save: write to a temp file
   in the same directory, `fsync`, `rename` over the target. (Seen on this
   machine 2026-10-30: a non-atomic write left a 0-byte file.)

## Stability budget (measured in the e2e suite)

| Operation | Target |
|---|---|
| Cold start to editable window | < 1.5 s on the dev machine |
| Typing into a 5 MB document | No main-thread task > 100 ms (PerformanceObserver `longtask`) during 200 keystrokes |
| Keystroke → preview shows it, 50 KB doc (typical) | p95 < 50 ms |
| Keystroke → preview shows it, 500 KB doc | p95 < 150 ms |
| Preview DOM patch per keystroke | Touches only changed blocks; p95 < 8 ms on the UI thread |
| Scrolling the preview (500 KB doc, fling) | No frame > 32 ms; no `longtask` |
| Sync scroll follow lag | The other pane moves in the same animation frame |

### Response time — every interaction has a budget
Response time is the product's first feature. Each row is an e2e
assertion; **a slice whose rows fail is not accepted**, and the suite runs
in CI so a later change cannot silently regress one.

| Interaction | p95 target |
|---|---|
| Keystroke → character painted in the editor | < 16 ms (one frame) |
| Switch tab | < 50 ms, preview shown from that tab's cached blocks, no re-render |
| Click a file in the sidebar → editable | < 100 ms for a 100 KB file |
| Toggle view mode / sidebar / theme | < 50 ms |
| Open a menu or context menu | < 50 ms |
| Window shown at startup | `ready-to-show`, never a blank or white flash |

How the budgets are kept:
- Nothing heavy at startup: highlight.js registers ~20 common languages
  and lazy-loads the rest in the worker; the sidebar and settings UI load
  after the first paint.
- Each tab keeps its CodeMirror state and its rendered preview blocks, so
  switching swaps them rather than re-parsing.
- Dark/light/background changes are CSS variables on the root — one
  style recalculation, no re-render.
- Startup runs in the background only after the window is interactive:
  draft recovery check, workspace restore, watchers.
| Open a 5 MB file | Editable in < 1 s |
| Crash recovery | Kill the renderer mid-edit → reopened window has the unsaved text |

## Architecture

```
main process (Node)                    renderer (sandboxed, no Node)
  window + menu + dialogs               tabs, layout, settings UI
  file IO (atomic save)   <--invoke-->  CodeMirror editor per tab
  settings store                        preview pane (sanitised DOM)
  drafts / crash recovery                  ^
  export: hidden window -> printToPDF      | postMessage
  single-instance + open-with           render worker: markdown-it +
                                         highlight.js -> HTML + line map
```

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
  The preload exposes a small typed API (`window.mdApi`) and nothing else.
- Strict CSP in the renderer; no remote content loaded except images the
  document references.
- Links in the preview open in the system browser (`http`, `https`,
  `mailto` only); in-document anchors scroll the preview.
- Relative image paths resolve against the document's folder.

### Preview pipeline (low latency while editing, fast scroll)
- **Adaptive scheduling, not a fixed debounce.** A render starts on the
  next animation frame after an edit if none is running; edits arriving
  while one runs coalesce into a single follow-up. A small doc therefore
  updates within one or two frames; a big doc renders as fast as the
  worker can, never queueing a backlog.
- **Block diffing.** The worker returns top-level blocks as
  `{key, line, html}`, where `key` is a hash of the block's source. The UI
  thread keeps the blocks already in the DOM and replaces, inserts or
  removes only those whose key changed. Typing in one paragraph touches
  one element — images elsewhere do not reload, scroll does not jump.
- **Sanitise only what changed.** DOMPurify runs per new block, not on the
  whole document.
- **Skip off-screen work.** Preview blocks use `content-visibility: auto`
  with `contain-intrinsic-size`, so the browser does not lay out or paint
  blocks far outside the viewport. Images get `loading="lazy"` and
  `decoding="async"`.
- **Virtualise big documents.** Above a block-count threshold (start at
  2,000 blocks; tune it in slice 2 by measurement) the preview keeps only
  the visible blocks ± 1 screen of overscan in the DOM. Heights are
  measured once and cached per block key, unmeasured ones estimated from
  their source size; spacers above and below keep the scrollbar honest,
  and sync scroll uses the same height map. Below the threshold the full
  DOM with `content-visibility` is kept, because it is simpler and lets
  in-page search see everything. With virtualisation on, preview search
  runs on the block list in the worker rather than on the DOM; export
  always renders the full document separately, so it is unaffected.
- **Scroll handlers never block.** Listeners are passive; work is
  rAF-throttled to one per frame; block offsets are cached and refreshed
  by `ResizeObserver`, so a scroll event does a binary search, not a DOM
  walk.
- **Measured.** A dev overlay (View > Performance, off by default) shows
  the last render time, patch time and blocks patched, and the e2e suite
  asserts the budget rows above.

### Sync scroll
The worker adds `data-line` (from markdown-it `token.map`) to every block
element. Editor → preview: top visible editor line → nearest block at or
before it → interpolate within the block → set preview scroll. Preview →
editor is the inverse. A guard ignores the scroll event the other pane
caused, so the two never feed back into each other. Toggle in the View menu.

### Drafts and session
Every 2 s of idle, dirty tabs are written (atomically) to
`userData/drafts/`. On start, open tabs and drafts are restored; a draft
newer than its file is offered back. Drafts are deleted on save or on
discard.

### Workspace sidebar
File > Open Folder (CmdOrCtrl+Shift+O) sets the workspace; the last one
is restored. The tree lists folders and Markdown files (`.md`,
`.markdown`); other files are hidden. Rules that keep it fast on a big
folder:
- **Lazy:** a folder's children are read (async, in main) only when it is
  expanded. Nothing scans the whole tree up front.
- **Skipped:** `.git`, `node_modules`, and dot-folders are not listed.
- **Capped:** a folder with more than 2,000 entries shows the first 2,000
  and a "more…" notice instead of blocking.
- **Watched:** `fs.watch` on expanded folders only (recursive watching is
  native on Windows and macOS); events are debounced 200 ms and only the
  affected folder is re-read. A watcher error drops back to a manual
  refresh button, never to a crash.
- **Virtualised list** in the renderer, so 10,000 visible rows scroll
  smoothly.
Actions: click opens (or focuses) the file's tab; the active tab's file
is highlighted in the tree; New File / New Folder / Rename / Delete (to
the OS trash, `shell.trashItem`) from a context menu; a filter box
narrows the visible tree by name. Renaming or deleting an open file
updates or closes its tab (prompting if dirty).

### Settings
`userData/settings.json`, atomic write, validated on load (bad or missing
keys fall back to defaults, never crash): theme, editor/preview background
colours, font size, view mode, sync scroll on/off, last session.

### Export
- **HTML:** one file, CSS inlined, current theme's preview styles (option:
  always light for export). Images keep their relative paths.
- **PDF:** a hidden window loads the same HTML with a print stylesheet and
  `printToPDF` (A4/Letter, margins, background colour on/off). Written to
  the chosen path atomically.

## Slices (Vision implements, Friday reviews each before the next)

Each slice ends with `npm run verify` green (typecheck + unit + e2e) and
a commit.

1. **Scaffold + core loop.** Project layout, secure window, one editor,
   worker-rendered preview side by side, open/save one file, atomic save,
   e2e harness. Tests: atomic save leaves the old file intact when the
   write fails; preview shows rendered Markdown; stale render dropped.
2. **Preview pipeline.** Adaptive scheduling, block diffing, per-block
   sanitise, `content-visibility`, preview virtualisation for big docs,
   the performance overlay. Replaces
   slice 1's fixed debounce. Tests: the latency and scroll budget rows
   (50 KB and 500 KB fixtures); typing in paragraph 3 leaves every other
   preview element the same DOM node (identity check); an image elsewhere
   is not re-requested.
3. **Tabs + safety.** Multiple files, dirty tracking, close prompts,
   drafts + crash recovery, session restore, single instance + open-with,
   drag-and-drop, preview-error resilience (rule 5). Tests: kill renderer
   → text recovered; close dirty tab → prompt; a render that throws keeps
   the previous preview + badge; a worker stuck in a loop is restarted
   within 2.5 s and the editor stays responsive throughout.
4. **Workspace sidebar (R11).** Open Folder, lazy tree, watcher, filter,
   file actions, toggle (CmdOrCtrl+B). Tests: a folder fixture with 5,000
   files lists in < 500 ms and the editor stays responsive; creating a
   `.md` file on disk appears in the tree within 1 s; deleting an open
   clean file closes its tab; `node_modules` is not listed.
5. **Views + sync scroll.** Split / editor-only / preview-only, divider,
   full screen, sync scroll both directions. Tests: scroll to a heading in
   the editor → same heading at the top of the preview (±1 block).
6. **Themes + colours + settings.** Light/dark/system, background pickers,
   font size, GitHub-style preview, code highlight. Tests: settings
   survive restart; a corrupt settings file loads defaults.
7. **Export.** HTML and PDF. Tests: exported HTML contains the rendered
   heading and inlined CSS; PDF file is valid (`%PDF-` header, > 1 page for
   a long doc).
8. **Hardening + packaging.** The stability budget as e2e tests (5 MB
   file), CI workflow building Windows and macOS installers.

## Verification and build

- `npm run verify` — `tsc --noEmit`, unit tests, e2e (under `xvfb-run` on
  Linux).
- Development and e2e run on this Raspberry Pi (Linux arm64). Windows and
  macOS installers are built by GitHub Actions on their own runners
  (macOS packages cannot be built on Linux). Pushing the repo to GitHub
  needs the user's go-ahead.
- Unsigned builds show a Gatekeeper / SmartScreen warning on first open;
  signing needs an Apple Developer ID and a Windows code-signing cert.

## Out of scope for v1
Live collaboration, plugins, Vim mode, cloud sync, spell check beyond the
OS default, Mermaid/KaTeX (candidates for v1.1, rendered in the worker).
