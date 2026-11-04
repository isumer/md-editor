# Slice 3.0 — characterisation tests (before any move)

Read AGENTS.md and docs/architecture.md §13. Purpose: pin today's
behaviour so the 3a–3e migration cannot change it unnoticed. **Tests
only** — do not change src/** at all. No package changes.

## Rules for these tests
- Phrase each test at the **contract level** so it survives code moving
  between processes: drive the app through its real surfaces (menu items
  by id via `application.evaluate`, the preload API from the page,
  files on disk) — never import a src module to call an internal
  function. A test of "main rejects X" must instead be "the file-save
  contract rejects X", sent through the preload API (`window.mdApi`) from
  the page so it crosses the real boundary.
- Dialogs: stub `dialog.showOpenDialog` / `showSaveDialog` in the main
  process with `application.evaluate` (boundary double) per test.
- Each test is shown **red** against a deliberately broken build (say
  which break you used per test) — you can build and inspect, but cannot
  run e2e; write the break as a one-line patch in your report and Friday
  runs it.
- Tag each test with its criterion.

## Tests (criteria in docs/acceptance, currently `planned`)
- AC-R5-10 Save As writes to the chosen path; later Save goes there.
- AC-R5-11 untitled document + Save → dialog → file written.
- AC-R5-12 cancelled Open and cancelled Save As change nothing (document
  text, title/dirty, files on disk).
- AC-R5-13 open of an unreadable file (missing path via stubbed dialog;
  a directory; a file with no read permission on POSIX) → status names
  it, current document unchanged.
- AC-R5-14 type during an in-flight save (make the save slow: stub a
  dialog is not enough — use a large document or delay via a fixture
  path on a slow fs is not possible; instead dispatch Save, then type
  immediately in the same `page.evaluate` turn) → still dirty, file holds
  the pre-typing text.
- AC-R5-15 menu items `file-open`, `file-save`, `file-save-as` actually
  run their actions (dialog stub called / file written).
- AC-R1-06 a render failure keeps the last good preview and shows an
  error; the next good render clears it. To force a failure without
  touching src: a document whose render throws is not reachable today —
  if no real input makes markdown-it throw, report that and propose the
  smallest test seam for 3a instead of inventing one.
- AC-SEC-07 through `window.mdApi.saveFile`: missing `text`, `text` not a
  string, `path` an object, a payload with `__proto__` keys, a 300 MB
  string (generate in page) → typed error, no file written, app
  responsive afterwards (type and see the preview update).
- AC-SEC-08 through `window.mdApi.openExternal`: `file:///etc/passwd`,
  `javascript:alert(1)`, `data:text/html,x`, `"not a url"`, `42` →
  typed error, `shell.openExternal` stub never called.

## Done means
typecheck, test:unit, build exit 0 (paste). Files changed. The break per
test. Friday runs e2e, the breaks, and flips the criteria to
`implemented`.
