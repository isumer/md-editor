review: deep

# Slice 13 — Export the preview (R6)

Base: main

Branch `feature/slice-13a-export-render`. Follow AGENTS.md. Implement the planned
criteria in `docs/acceptance/R06-export.md` (AC-R6-01 … 05); mark each
`implemented` only with its test. No new dependencies.

## What
- **HTML:** File > Export > HTML… writes one self-contained file: the
  rendered preview of the active Markdown tab, the current theme's preview
  CSS inlined (option "always light"), highlighted code, images keep their
  relative paths. Build it from the render worker's output, not by
  serialising the live preview DOM (that DOM is virtualised).
- **PDF:** File > Export > PDF… loads the same HTML in a hidden, sandboxed
  window in main (no preload, no node, `app://`-style isolation as in
  SEC rules) with a print stylesheet, then `webContents.printToPDF` with
  A4/Letter, margins, background on/off.
- **This step (13a) stops before the file write.** Export produces the HTML
  string and the PDF bytes and hands them to one function in
  `src/main/export/` that takes a granted path and the bytes. Writing those
  bytes needs a binary request through the io-worker (`ioControl`,
  `ioWorker`, `io-worker/control`, `FileService`); those four files are
  under review on `feature/io-port-restart`, so the write is step 13b,
  queued after that branch merges. In 13a, add no menu items or commands (13b
  wires them with the write), so nothing ships half-wired; tests call the
  export functions directly. Mark only the criteria 13a fully proves as
  `implemented`; the rest stay `planned` for 13b.
- Export runs off the UI thread; the editor keeps the keystroke budget
  while it runs (AC-R6-05).

## Allowed files
New: `src/renderer/features/export/**`, `src/main/export/**`, their tests
(`test/unit/export*.test.ts`, `test/e2e/export.spec.ts`), fixtures under
`test/fixtures/export/`. Existing, only to register the commands, menu
items, message keys and one IPC contract for export: the command/menu
registry, `src/shared` contract and message files, `src/preload` grant
list. Do not touch the sidebar/tree, tabs or preview pipeline files (other
lanes work there). If export needs a change elsewhere, stop and name it.

## Security
The hidden PDF window and the new IPC contract are a trust boundary:
validate the request in main, no `file://` loads, no remote content, deny
navigation and window.open. Add a SEC-style test for the window's
webPreferences.

## Checks before you finish
`npm run verify` green on Linux. PDF validity is checked by header and
page count, not by pixels.
