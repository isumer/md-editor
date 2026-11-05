# Side — Slice 7 binary-detection fixtures

**Starts from `main`** and runs alongside the current slices. File-disjoint
from every queued or running slice (slice 4-fix and slice 5 touch `src/**`,
`test/unit/**`, `test/e2e/**`; nim 042 touches `test/fixtures/export/**`;
side/044 touches `test/fixtures/views/**`; side/040 touches
`test/fixtures/powertools/**`): this task touches only `test/fixtures/binary/**`.

Slice 7 (text editing, PLAN "Slices" §7) includes binary detection: its tests
assert "a binary file is refused" on open. This task provides real, committed
binary byte-files with their exact distinguishing bytes written down, so slice
7's tests assert against known bytes instead of generating buffers ad hoc. It
does not define the detection rule — slice 7's brief does — it only supplies
the samples and documents their bytes.

## Deliverables (all under `test/fixtures/binary/`)
- `.gitattributes` — mark the binary samples `-text` so git stores their bytes
  exactly (do NOT mark the README).
- Byte files, each small (under 64 bytes):
  - `nul-byte.bin` — printable ASCII for the first 16 bytes, then one NUL byte,
    then more ASCII.
  - `nul-at-start.bin` — a NUL byte as the very first byte.
  - `utf16le-bom.txt` — the bytes `FF FE` then `hello` in UTF-16LE.
  - `invalid-utf8.bin` — ASCII prefix then the bytes `C3 28` (a truncated
    two-byte UTF-8 sequence).
  - `tiny.png` — a real 1x1 PNG (any generator, under 1 KB) with the standard
    8-byte PNG signature.
- `README.md` — one short paragraph: what the fixtures are for; for each file,
  the exact hex of its first 16 bytes and the total byte count, so slice 7 can
  assert without re-deriving.

## Verify
- `npm run verify` stays green (fixture-only change).
- Show `od -A x -t x1z` of the first 16 bytes of each file next to the README
  table, so the written-down hex matches the committed bytes.

## Allowed files
test/fixtures/binary/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows, no package.json.

## Done means
list files; paste the `od` output next to the README hex; paste
`npm run verify` output.
