# Slice 7 wiring part — refuse a binary file on open (Vision)

Base: main

Wire the merged `src/shared/text/binary.ts` into the io-worker read path.
This item adds no UI and no new dependency. Criterion AC-R12-01 in
`docs/acceptance/R12-text-editing.md` is planned; do not edit it. No new
dependencies.

## The change
`IoFileService.read` (`src/io-worker/services/file.ts:94`) reads the file
as UTF-8 text. Change it to:
1. Read the file bytes with `fs.readFile(filePath)` (no encoding).
2. Run `isBinarySample` on the bytes. It samples at most 8192 bytes and
   exempts a UTF-8, UTF-16LE or UTF-16BE byte order mark.
3. When it reports binary, throw a typed service error with code
   `BINARY_FILE` and message key `file.binary`.
4. Otherwise decode with `bytes.toString("utf8")` and return as today.

Add `BINARY_FILE` to `ServiceErrorCode` in `src/shared/ipc/result.ts`.
Add `file.binary` to `src/shared/messages/en.ts` with exactly this text:
`Could not open “{file}”: it is a binary file.` Keep every existing
message unchanged. Do not change `MAX_IO_TEXT_LENGTH` or the grant rules.

## Tests
- `test/unit/ioWorker.test.ts` (extend it): with a registered read grant,
  reading `test/fixtures/binary/nul-byte.bin` rejects with code
  `BINARY_FILE` and key `file.binary`. Reading
  `test/fixtures/binary/utf16le-bom.txt` returns its exact text (the BOM
  exception). Reading `test/fixtures/encodings/utf8-bom.txt` returns its
  exact text. Tag AC-R12-01.
- New `test/e2e/binary-open.spec.ts`: stub the open dialog to
  `test/fixtures/binary/nul-byte.bin`, choose File > Open, and assert the
  status bar shows `Could not open “nul-byte.bin”: it is a binary file.`
  and the current document text is unchanged. Tag AC-R12-01. Use
  `readTextOrNull` from `test/e2e/helpers.ts` where a file is read.

Red evidence: run the new tests before the change (import fails), then
with the `isBinarySample` check removed (the unit and e2e tests go red).
Paste both.

## Allowed files
src/io-worker/services/file.ts, src/shared/ipc/result.ts,
src/shared/messages/en.ts, test/unit/ioWorker.test.ts,
test/e2e/binary-open.spec.ts. Nothing else — no other src file, no
preload, no main, no fixtures, no acceptance docs, no coverage config, no
workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
`npm run check:coverage` and `npm run build` exit 0 — paste each. Then
`node scripts/run-e2e.cjs --repeat-each 3` is green except the
information-only perf tests — paste the summary. List the changed files;
paste the red evidence.
