review: deep

# Slice 13 — Export the preview (R6)

Base: main

Branch `feature/slice-13-export`. Follow AGENTS.md. Implement the planned
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
- Both are written through the existing atomic save path (FileService in
  the io-worker) to a path from the save dialog; the grant model applies.
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
