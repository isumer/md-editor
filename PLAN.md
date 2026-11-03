# MD Editor — plan

A standalone **Notepad++-class text editor with first-class Markdown**:
it should cover everyday text and code editing the way Notepad++ does,
and add a live Markdown preview, export and a workspace view on top.
Windows and macOS for v1; Linux later (Electron runs there already —
development and tests run on Linux — so it is a packaging step). The
overriding requirement is that it is **fast and never freezes or
crashes**; every feature below is subordinate to that.

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
| R9 | Windows + macOS (Linux later) | Installers for both from CI; Linux AppImage/deb added later as a packaging target |
| R10 | Fast, stable | See "Stability budget" — measured, not asserted |
| R11 | Workspace sidebar | Open a folder; the left panel lists its folders and `.md` files as a tree; click opens in a tab; toggle the panel; updates when files change on disk |
| R12 | Plain text and code files, Notepad++-style | `.txt` and source files open in tabs with language-aware highlighting and the editing tools in "Text editing" |
| R13 | Notepad++ toolset | The everyday Notepad++ tools listed in "Power tools" |

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
| Window resize (continuous, 500 KB doc) | No frame > 32 ms; top visible block unchanged |
| Enter / leave full screen or focus mode | Interactive < 100 ms after the OS animation |
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
| Open a 20 MB file | Editable < 1.5 s; first preview screen < 1 s |
| Keystroke → preview, 20 MB doc | p95 < 100 ms (incremental parse) |
| Scroll / resize, 20 MB doc | Same frame budget as 500 KB |
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
- **Heading anchors, GitHub-style.** Headings get slug ids the way
  GitHub makes them (lower-case, punctuation dropped, spaces → `-`,
  duplicates `-1`, `-2`; Turkish letters kept), prefixed `user-content-`
  so no slug can clobber a DOM property; `#kurulum` resolves to
  `user-content-kurulum`. Table-of-contents links therefore work as on
  GitHub.
- **Measured.** A dev overlay (View > Performance, off by default) shows
  the last render time, patch time and blocks patched, and the e2e suite
  asserts the budget rows above.

### Text editing (R12)
Any text file opens, not only Markdown. The preview pane exists only for
Markdown tabs; other tabs are editor-only and the view-mode controls hide.
- **Highlighting:** language chosen from the extension (then shebang /
  first line), overridable from the status bar and from a Notepad++-style
  **Language** menu (alphabetical, grouped by letter). Full grammars —
  highlighting, folding, auto-indent, bracket matching, toggle comment —
  for at least Java, Python, JavaScript/TypeScript, JSON, XML/HTML, CSS,
  SQL, shell, YAML, C/C++, C#, Go, Rust, PHP, Markdown; the rest of
  `language-data` gets highlighting at least.
- **Notepad++ parity.** Every language in Notepad++'s built-in Language
  menu is supported, with its usual extensions mapped. The slice keeps a
  coverage table (`docs/languages.md`: Notepad++ language → extensions →
  source — `language-data`, `@codemirror/legacy-modes`, or ours). Where
  CodeMirror has no mode (e.g. Batch, NSIS, Inno Setup, AutoIt, Registry,
  Intel HEX / S-Record, KiXtart, PureBasic), we write a small
  `StreamLanguage` definition — keywords, comments, strings, numbers —
  which is the level Notepad++ itself offers for those. Each mode is
  loaded lazily like the rest.
- **Any other file** that is text (no NUL bytes) opens as plain text with
  no highlighting, and the user can pick a language from the menu. `@codemirror/language-data`
  lazy-loads each language's parser the first time it is needed, so ~100
  languages cost nothing at startup. Lezer parsing is incremental and
  limited to the viewport, so it stays fast on big files.
- **Find / replace:** in-file with regex, case, whole word, replace all,
  match count; **Find in Files** across the workspace, run in main in
  batches with a cancel button and results streamed in, skipping binary
  files and the sidebar's ignore list.
- **Editing:** line numbers, go to line (CmdOrCtrl+G), code folding,
  multi-cursor and column (rectangular) selection, duplicate / move /
  delete line, toggle comment, indent with tabs or spaces (detected per
  file), show whitespace and line endings, word-wrap toggle per tab, zoom.
- **Encoding and line endings** (status bar, per file): detected on open —
  UTF-8 (with/without BOM), UTF-16 LE/BE, and legacy single-byte code
  pages such as Windows-1254 (Turkish) and Windows-1252. Saved back in the
  same encoding and line endings unless the user converts them. A file
  that cannot be decoded cleanly opens read-only with a notice instead of
  being silently corrupted on save. New dependencies for this
  (`iconv-lite` to encode legacy code pages, `chardet` to detect) are
  added by Friday in this slice with the usual dependency checks.
- **Binary files** (NUL bytes in the first 8 KB) are not opened as text;
  the user gets a notice.
- **Changed on disk:** a file modified by another program is reloaded
  automatically if the tab is clean, or offers Reload / Keep mine if
  dirty.
- **Sidebar:** a toggle between "Markdown only" and "All text files".

### Power tools (R13) — the rest of what Notepad++ is used for
- **Line operations** (Edit > Line Operations): sort asc/desc (case
  options, numeric), remove duplicate lines, remove empty lines, trim
  leading/trailing whitespace, join lines, split lines, reverse order;
  UPPER / lower / Title / iNVERT case; tabs ↔ spaces.
- **Search extras:** highlight all occurrences of the selected word
  (smart highlight); Mark All with a colour; bookmark lines (toggle,
  next/previous, copy/cut/delete bookmarked lines); find in all open
  tabs; **Replace in Files** with a preview of every change before it is
  written, and atomic writes per file; a docked search-results panel.
- **Column editor:** insert text or an incrementing number sequence down
  a column selection.
- **Macros:** record, play back, play N times / to end of file, save
  named macros.
- **Word completion** from the words in open documents, plus language
  keywords.
- **Outline panel (Function List):** symbols for code via the Lezer
  tree, headings for Markdown; click jumps, follows the cursor.
- **Document map (minimap)** toggle.
- **Second view:** move or clone a tab into a side-by-side second editor
  view (clone = same document, two cursors).
- **Tab menu:** copy path / name / folder path, open containing folder,
  reveal in sidebar, pin tab, close others / to the right / unchanged;
  recent files and recent folders (File menu); read-only toggle.
- **Formatters:** pretty-print / minify JSON and XML (built-in, no
  external tool), with a clear error position on invalid input.
- **Tail mode** (Notepad++'s "Monitoring"): a `.log` tab follows
  appended lines, reading only the new bytes.
- **Print** the editor text (with highlighting) or the Markdown preview.
- **Compare two files** (side-by-side diff with change navigation) —
  Notepad++ needs a plugin for this; it is the last power-tools item and
  may move to v1.1 if the slice runs long.
Every action is in a menu and in a **command palette** (CmdOrCtrl+Shift+P)
and has a rebindable shortcut; defaults follow Notepad++ on Windows
(Ctrl+D duplicate, Ctrl+Shift+Up/Down move line, Ctrl+F2 bookmark, …)
and platform conventions on macOS.

### Large files
Target: a **20 MB / ~400k-line** document behaves like a small one —
typing and scrolling stay inside the normal budgets. The cost of an edit
must depend on the size of the change, not of the document.
- **Incremental parse.** The worker splits the source into top-level
  chunks at blank lines outside fenced code / HTML blocks, keyed by
  content hash. An edit re-parses only the chunks it touched (plus one
  neighbour each side for merged/split blocks); unchanged chunks reuse
  their cached blocks. Reference-link definitions are collected in a
  cheap document-wide pre-pass, and a change to one invalidates only the
  chunks that use that label.
- **First screen first.** On open, the editor is editable immediately; the
  worker renders the chunks around the visible position first, then the
  rest in slices that yield between batches, so the preview fills in
  without ever blocking.
- **The hang guard is per chunk**, not per document: a single chunk
  taking > 2 s is the hung case; a big document that is simply long is
  never killed.
- **Bounded memory.** Inactive tabs keep their CodeMirror state but their
  preview block cache is evicted LRU beyond a 200 MB total budget, and
  rebuilt (first screen first) when the tab is shown.
- **Bounded side work.** Draft autosave for documents > 5 MB runs every
  10 s instead of 2 s and only when changed; the atomic save streams the
  write rather than building a second copy in memory.
- **Pathological input.** A line longer than 100k characters (minified
  or generated text) switches that tab's editor wrapping off and shows a
  notice — CodeMirror lays out a wrapped giant line on every edit.
  Documents > 50 MB open in large-file mode: preview paused until the user
  turns it on, with a notice. Stated limits rather than a freeze.

### Full screen and window resizing
- **Full screen:** View > Full Screen (F11 on Windows, Ctrl+Cmd+F on
  macOS) uses the OS full screen. **Focus mode** (CmdOrCtrl+Shift+F) is
  full screen plus hidden tab bar, sidebar and status bar, for whichever
  view mode is active — so "editor alone, full screen" and "preview alone,
  full screen" are one keystroke each. Esc leaves focus mode.
- **Resizing never stalls**, because the work a resize causes is bounded:
  - The preview text column has a max width (default 900 px, setting);
    beyond it a wider window adds margin, not reflow.
  - Panes use CSS `contain: strict` so a resize of one does not lay out
    the other; the split divider is a CSS grid track, no JS layout.
  - While a resize is in progress (resize events within 150 ms), cached
    block heights are only marked stale; the virtualiser keeps using
    them, and re-measures the visible blocks once the size settles. The
    scroll position is anchored to the top visible block, so the
    document does not jump.
  - Every resize-driven callback is rAF-throttled to one per frame.
- **Budget (e2e):** resizing the window continuously for 2 s on a 500 KB
  document — no frame > 32 ms, no `longtask`, and the top visible block
  is the same before and after. Entering / leaving full screen or focus
  mode: interactive within 100 ms after the OS animation ends.

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
2. **CI + release pipeline → v0.0.1.** Moved forward so every later
   slice is tested on real Windows and macOS, and the user can install
   builds early. `ci.yml`: verify on ubuntu and windows for every push
   (macOS on tags and on manual dispatch — a private repo's macOS
   minutes count 10×). `release.yml` per "Releases". The repository
   layout above: README, CHANGELOG, SECURITY, AGENTS/CLAUDE.md, issue and
   PR templates, dependabot, .editorconfig/.gitattributes, app icon.
   Windows classic "Edit with …" / "Open folder in …" entries and
   macOS Open With per "Shell integration".
   Ends with the v0.0.1 draft release (slice 1's editor) checked and
   handed to the user to publish.
3. **Preview pipeline.** Adaptive scheduling, block diffing, per-block
   sanitise, `content-visibility`, preview virtualisation for big docs,
   the performance overlay. Replaces
   slice 1's fixed debounce. Incremental chunk parse and first-screen-
   first rendering for large files. Tests: the latency and scroll budget rows
   (50 KB, 500 KB and 20 MB fixtures; editing a 20 MB doc re-parses
   only the touched chunks — counted, not timed); typing in paragraph 3 leaves every other
   preview element the same DOM node (identity check); an image elsewhere
   is not re-requested.
4. **Tabs + safety.** Multiple files, dirty tracking, close prompts,
   drafts + crash recovery, session restore, single instance + open-with,
   drag-and-drop, preview-error resilience (rule 5). Tests: kill renderer
   → text recovered; close dirty tab → prompt; a render that throws keeps
   the previous preview + badge; a worker stuck in a loop is restarted
   within 2.5 s and the editor stays responsive throughout.
5. **Workspace sidebar (R11).** Open Folder, lazy tree, watcher, filter,
   file actions, toggle (CmdOrCtrl+B). Tests: a folder fixture with 5,000
   files lists in < 500 ms and the editor stays responsive; creating a
   `.md` file on disk appears in the tree within 1 s; deleting an open
   clean file closes its tab; `node_modules` is not listed.
6. **Text editing (R12).** Any text file, lazy language highlighting,
   find/replace, Find in Files, editing tools, encodings + line endings,
   binary detection, changed-on-disk handling. Tests: a Windows-1254
   file with `ğüşıöç` round-trips byte-identical; a `.java` and a `.py`
   fixture each show keyword/string/comment tokens, fold a method
   block, and toggle comment with the right marker (`//`, `#`); every row
   of `docs/languages.md` has a fixture file and a test asserting that
   its extension selects that language and at least a comment and a
   keyword (or the format's equivalent) get highlight tokens; a CRLF file stays
   CRLF after edit+save; Find in Files over 5,000 files streams first
   results < 300 ms and cancels; a binary file is refused; editing a
   20 MB `.log` keeps the keystroke budget.
7. **Power tools (R13).** Line operations, search extras and Replace in
   Files, column editor, macros, word completion, outline, document map,
   second view, tab menu, formatters, tail mode, print, command palette,
   rebindable shortcuts. Compare last. Tests per tool on fixtures (e.g.
   sort + dedupe on a 100k-line file < 300 ms and undoable in one step;
   a recorded macro replays identically; Replace in Files previews then
   writes atomically and skips files changed since the preview).
8. **Views + sync scroll.** Split / editor-only / preview-only, divider,
   full screen, focus mode, resize stability, sync scroll both directions. Tests: scroll to a heading in
   the editor → same heading at the top of the preview (±1 block).
9. **Themes + colours + settings.** Light/dark/system, background pickers,
   font size, GitHub-style preview, code highlight. Tests: settings
   survive restart; a corrupt settings file loads defaults.
10. **Export.** HTML and PDF. Tests: exported HTML contains the rendered
   heading and inlined CSS; PDF file is valid (`%PDF-` header, > 1 page for
   a long doc).
11. **Hardening + packaging.** The stability budget as e2e tests (5 MB
   file), the stability budget asserted on all CI platforms, auto-update and
    signing if decided, v1.0.0.

## Verification and build

- `npm run verify` — `tsc --noEmit`, unit tests, e2e (under `xvfb-run` on
  Linux).
- Development and e2e run on this Raspberry Pi (Linux arm64). Windows and
  macOS installers are built by GitHub Actions on their own runners
  (macOS packages cannot be built on Linux). Pushing the repo to GitHub
  needs the user's go-ahead.
- Unsigned builds show a Gatekeeper / SmartScreen warning on first open;
  signing needs an Apple Developer ID and a Windows code-signing cert.

## Test standards (also in AGENTS.md; Friday rejects a slice that breaks them)
- **Red before green.** Every test is shown to fail on code without the
  behaviour (or with it deliberately broken) before it counts. Friday
  re-checks a sample of each slice's tests by breaking the code under
  them and confirming they go red.
- **Names state the rule**, e.g. `save keeps the original file when the
  write fails`, not `test atomicWrite 2`. One behaviour per test,
  arrange / act / assert in order.
- **No sleeps.** Waiting is polling on a condition (`expect.poll`,
  `toHaveText`) with a timeout; `waitForTimeout` is banned outside
  performance measurement windows.
- **Independent and deterministic.** Each test owns its temp dir and
  fixtures and removes them; time and randomness are injected; no test
  depends on another's order or on the network.
- **No flake tolerated.** Playwright `retries: 0` in CI. A flaky test is
  fixed or deleted, never retried into green.
- **Test what a user would notice.** E2E drives the real app through its
  real surfaces (menus via their ids, DOM via roles/test ids, files on
  disk); unit tests cover pure logic with fakes only for collaborators
  (fs, clock), never for the unit itself.
- **Performance tests are statistics, not single runs:** warm-up, N ≥ 30
  samples, assert on p95, print the distribution in the report. Budgets
  are absolute; if a CI runner class is slower, its factor is a named,
  committed constant per platform, not a widened assertion.
- **Coverage means failure modes:** each slice lists the failure modes it
  guards (crash, data loss, freeze, wrong output) and the test for each.
  A line-coverage number is reported, not targeted.
- **Fixtures are real:** encoding fixtures are byte files checked in with
  `-text`; large fixtures (5 MB, 20 MB, 5,000-file folders) are generated
  deterministically by a seeded script at test time, not committed.

## CI (`.github/workflows/ci.yml`)
- On every push and PR: `npm ci` (lockfile exact) → typecheck → unit →
  build → e2e, on `ubuntu-latest` (under xvfb) and `windows-latest`;
  `macos-latest` on tags and manual dispatch.
- Fail fast is off, so one platform's failure still shows the others.
- On failure: Playwright traces, screenshots and the app's stderr log are
  uploaded as artifacts; a JUnit report feeds the job summary, which
  also prints the performance distributions.
- Actions pinned by commit SHA; `permissions: contents: read` (release
  workflow alone gets `contents: write`); npm cache keyed on the
  lockfile; concurrency group cancels superseded runs on the same branch.
- `main` is protected: merge requires CI green.

## Repository layout (modelled on github.com/anthropics/claude-code)
```
README.md            badges (release, CI, platforms), one-paragraph pitch,
                     demo GIF, Download (per OS, from Releases), Features,
                     Build from source, Reporting bugs, License
CHANGELOG.md         Keep a Changelog; each release's notes come from here
LICENSE.md           the user's choice (see below)
SECURITY.md          how to report a vulnerability; the app's security
                     model in brief (sandboxed renderer, sanitised preview)
CLAUDE.md, AGENTS.md working rules for AI contributors (Friday, Vision):
                     the stability rules, budgets, verify command, scope
                     discipline — Vision reads AGENTS.md automatically
.editorconfig        indentation / final newline / charset
.gitattributes       LF in the repo; encoding and line-ending fixtures
                     marked -text so git never rewrites them
.github/
  ISSUE_TEMPLATE/    bug_report.yml (OS, version, steps, file size),
                     feature_request.yml, config.yml
  PULL_REQUEST_TEMPLATE.md
  workflows/         ci.yml, release.yml
  dependabot.yml     weekly npm + actions updates, one PR per package
assets/              app icon (all sizes), demo.gif, screenshots
docs/                architecture.md (this plan, once settled),
                     languages.md, shortcuts.md, dev/briefs/ (the Vision
                     briefs, kept as history)
examples/            sample documents exercising every feature
scripts/  src/  test/
```
GitHub settings: description, topics (`markdown-editor`, `text-editor`,
`electron`, `notepad-plus-plus-alternative`), branch protection on
`main` requiring CI green. The licence is the user's decision (the repo
is private today; `UNLICENSED` / all rights reserved until chosen).

## Shell integration ("Edit with …" like Notepad++)
**Windows — classic context menu (v0.0.x):** the NSIS installer
(electron-builder `nsis.include` script) writes per-user keys, no admin
needed, and the uninstaller removes them:
- `HKCU\Software\Classes\*\shell\<App>Edit` — "Edit with <App>" on
  every file, with the app icon, command `"<exe>" "%1"`.
- `…\Directory\shell\<App>Open` and `…\Directory\Background\shell\…`
  — "Open folder in <App>" (opens it as the workspace).
- Optional, chosen on an installer page (all off by default except
  the context menu): register as an "Open with" handler for `.md`,
  `.txt`, `.log`, `.json`, …; make it the default for `.md`.
- Multi-selection: Explorer starts one process per file; the single-
  instance lock forwards every path to the running window, which opens
  them as tabs (one window, never N windows).
- On Windows 11 the classic entry sits under "Show more options".

**Windows 11 top-level menu (later, needs signing):** an
`IExplorerCommand` shell extension DLL (small C++ project, built in CI on
windows-latest) registered through a signed sparse MSIX package — the
mechanism Notepad++ 8.4+ uses. Blocked on a code-signing certificate;
until then the classic entry is the only one.

**macOS:** `fileAssociations` / `CFBundleDocumentTypes` put the app in
Finder's "Open With" for the same types (Viewer role for most, Editor
for text and Markdown); a bundled Quick Action ("Edit with <App>")
appears in the Finder context menu and Services. Opening a file while
the app runs arrives as `open-file` and becomes a tab.

**Tests:** unit — the registry entries the installer script writes are
generated from one table and compared to a golden file; e2e on the
windows CI runner — after a silent install, the keys exist with the
right command and icon, launching `"<exe>" a.md` then `"<exe>" b.md`
yields one window with two tabs, and a silent uninstall removes every
key.

## Releases (GitHub Releases, per-platform downloads)
Modelled on github.com/anthropics/claude-code/releases: each version is a
GitHub Release with notes and one download per platform/architecture.
- **Versioning:** starts at **0.0.1** (user, 2026-11-04); 0.0.x while
  slices land, each release a usable build, 1.0.0 when all slices pass.
- **Trigger:** pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`.
  A matrix builds on native runners — `windows-latest`, `macos-latest`,
  and later `ubuntu-latest` — because macOS packages cannot be built
  elsewhere and native builds avoid cross-compile surprises.
- **Every job runs `npm run verify` first**; a red suite on any platform
  fails the release. The response-time budgets are therefore checked on
  real Windows and macOS, not only on the Pi.
- **Assets** (electron-builder, `--publish always` into a draft release):

  | Platform | Files |
  |---|---|
  | Windows x64 / arm64 | `MD-Editor-Setup-X.Y.Z-x64.exe`, `-arm64.exe` (NSIS installer), `MD-Editor-X.Y.Z-win-x64.zip` (portable) |
  | macOS Apple Silicon / Intel | `MD-Editor-X.Y.Z-arm64.dmg`, `-x64.dmg`, plus `.zip` of each |
  | Linux x64 / arm64 (later) | `.AppImage`, `.deb` |
  | All | `SHA256SUMS.txt` |

- **Notes:** the release body is the version's section of `CHANGELOG.md`
  (Keep a Changelog format), written as part of each change, not at
  release time.
- **Draft first:** the workflow leaves the release as a draft; Friday
  smoke-checks the assets (installers present, checksums match, the
  macOS app's architecture is right) and the user publishes it.
- **Auto-update (optional, decided at slice 10):** `electron-updater`
  reads the same release (`latest.yml` / `latest-mac.yml`). It needs the
  release assets to be publicly readable, and on macOS a signed app.
- **Visibility:** the repo is private, so release downloads work only for
  signed-in collaborators. Public download links need either a public
  repo or a separate public releases-only repo the workflow publishes
  to — the user's call before the first release.
- **Signing:** unsigned builds work but warn on first open (Gatekeeper,
  SmartScreen). An Apple Developer ID and a Windows code-signing
  certificate plug into the same workflow as repository secrets.

## Out of scope for v1
Live collaboration, a plugin system, Vim mode, hex editing, cloud sync, spell check beyond the
OS default, Mermaid/KaTeX (candidates for v1.1, rendered in the worker).

Linux packaging (AppImage, deb) is planned after v1: the app is already
developed and tested on Linux, so it is an electron-builder target and a
CI job, not a port.
