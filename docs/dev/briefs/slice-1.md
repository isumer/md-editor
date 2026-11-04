# Slice 1 — scaffold + core loop

Repo: /home/hisumer/workspace/mdeditor (read PLAN.md first; it is the spec).
Dependencies are ALREADY INSTALLED and pinned — do not add, remove or
upgrade any package, and do not run npm install (no network in your
sandbox). Do not touch PLAN.md, package-lock.json or .git.

## Files you may create / edit (nothing else)
- package.json — the "scripts" block only
- tsconfig.json, tsconfig.main.json, tsconfig.renderer.json
- vite.config.mts, vitest.config.mts, playwright.config.ts
- src/main/**, src/preload/**, src/shared/**, src/renderer/**
- test/unit/**, test/e2e/**, test/fixtures/**

## Build layout
- main + preload: `tsc -p tsconfig.main.json` -> CommonJS in dist/main and
  dist/preload (package.json "main" is dist/main/main.js; no "type" field,
  so .js is CommonJS — keep it that way).
- renderer: Vite, root src/renderer, outDir dist/renderer, `base: './'`,
  worker format "es". Loaded with `loadFile` (file://), so no dev server
  is required for e2e.
- scripts: `build`, `typecheck` (both tsconfigs, --noEmit), `test:unit`
  (vitest run), `test:e2e` (build, then playwright; wrap with
  `xvfb-run -a` when on Linux and DISPLAY is unset — do it in a tiny
  node script under scripts/ if needed; you may create scripts/** too),
  `verify` (typecheck + test:unit + test:e2e), `start` (build + electron .).

## Behaviour required in this slice
1. Window: `contextIsolation: true`, `sandbox: true`,
   `nodeIntegration: false`, preload exposing `window.mdApi` via
   contextBridge with typed methods only (types in src/shared/).
   CSP meta in index.html: default-src 'self'; img-src 'self' file: data:
   https:; style-src 'self' 'unsafe-inline'; worker-src 'self';
   script-src 'self'.
2. Layout: editor (CodeMirror 6, markdown language, line wrapping) on the
   left, preview on the right, 50/50. `data-testid="editor"` on the
   editor host, `data-testid="preview"` on the preview scroll container.
3. Rendering: markdown-it (html: true, linkify: true, typographer: false)
   + highlight.js for fenced code, inside a Web Worker
   (src/renderer/render.worker.ts). Every block-level opening token with a
   `map` gets `data-line="<start line, 0-based>"`. Output HTML is sanitised
   with DOMPurify in the renderer before insertion (keep data-line).
   Task lists (`- [ ]`, `- [x]`) render as disabled checkboxes — write a
   small markdown-it core rule; no new package.
4. Render scheduler (src/renderer/renderScheduler.ts, pure, no DOM):
   debounce 150 ms after the last change, but never wait more than 500 ms
   from the first unrendered change; every request carries an increasing
   id; a worker result whose id is older than the newest applied id is
   dropped. Time source injected so it is unit-testable.
5. Files (main process, all async, no *Sync fs after startup):
   - Open: dialog, read UTF-8, return {path, text}.
   - Save: if the doc has a path, write it; else Save As dialog.
   - Atomic write in src/main/atomicWrite.ts: write `<name>.<random>.tmp`
     in the same directory, fsync it, close, rename over the target; on
     any failure remove the tmp and rethrow with the cause attached. The
     original file must be untouched when the write fails.
   - Every ipcMain.handle wraps its body: returns
     `{ok: true, value}` or `{ok: false, code, message}` — never throws
     across IPC. Renderer shows the message in a small status bar.
   - A file path given as a command-line argument is opened at startup
     (needed for "open with" and used by the e2e tests).
6. Menu + shortcuts: File > Open (CmdOrCtrl+O), Save (CmdOrCtrl+S),
   Save As (CmdOrCtrl+Shift+S), Quit. Title shows the file name and a
   "•" when there are unsaved changes.
7. Process-level safety: `process.on('uncaughtException')` and
   `unhandledRejection` in main log to stderr (structured: event, message)
   and do not exit; `render-process-gone` and `unresponsive` on the
   window are logged (recovery comes in slice 2).

## Tests you must write
Unit (vitest) — these you can run:
- atomicWrite: writes content; overwrites existing; when the write step
  fails (inject the fs functions), the original content is unchanged and
  no `.tmp` file is left in the directory.
- renderScheduler: single change renders after 150 ms; continuous changes
  every 100 ms render by 500 ms; a stale result (older id) is not applied.
- render (the pure function the worker wraps, put it in
  src/renderer/render.ts): heading gets data-line; fenced code is
  highlighted (`hljs` class present); `- [x] done` yields a checked,
  disabled checkbox; `<script>` survives markdown-it but is removed by the
  sanitiser step (test the sanitise helper with jsdom-free logic or skip
  if it needs a DOM — say so in your report).

E2E (playwright `_electron`) — you CANNOT run these (your sandbox has no
TCP sockets); write them and Friday will run them:
- Launch with test/fixtures/sample.md as argv → preview contains an `h1`
  with the fixture's heading text within 2 s.
- Type `\n\n## Added` at the end of the editor → preview shows an `h2`
  "Added" within 1 s.
- Copy sample.md to a temp dir, open it, type, press Ctrl+S → file on disk
  contains the typed text; title loses the "•".

## Done means
- `npm run typecheck` and `npm run test:unit` exit 0 (paste the output).
- `npm run build` exits 0.
- Report: files created, anything in this brief you could not do and why.
Keep comments to one or two lines and only where the code cannot say it.
