# Slice 7 module part — binary detection (side lane)

Base: main

A pure module that decides from a file's first bytes whether it is binary.
Slice 7 wires it into open later (dev lane); this item adds no wiring.
Criterion: AC-R12-01 in `docs/acceptance/R12-text-editing.md` (already
written, `status: planned`; do not edit it). No new dependencies.

## The module
New file `src/shared/text/binary.ts`. No imports. Exports exactly:
- `export const BINARY_SAMPLE_BYTES = 8192;`
- `export function isBinarySample(bytes: Uint8Array): boolean`

Rules, in this order:
1. If `bytes` starts with `ef bb bf`, `ff fe` or `fe ff`: return `false`.
2. If any byte at index `0 .. min(bytes.length, BINARY_SAMPLE_BYTES) - 1`
   is `0x00`: return `true`.
3. Otherwise return `false`. Invalid UTF-8 is not binary: slice 7 decodes
   legacy encodings such as Windows-1254.

The function must not copy `bytes` and must not read past index 8191.

## Tests (`test/unit/binaryDetection.test.ts`, every title starts `AC-R12-01:`)
Read the committed fixtures in `test/fixtures/binary/` with `node:fs`.
- `nul-byte.bin` → true (its NUL is at offset 0x10, past the first 16 bytes).
- `nul-at-start.bin` → true.
- `tiny.png` → true.
- `utf16le-bom.txt` → false (it contains NUL bytes after the BOM).
- `invalid-utf8.bin` → false.
- `test/fixtures/sample.md` → false.
- Built buffers: empty → false; 8192 bytes of `0x61` with `0x00` at index
  8191 → true; the same with `0x00` at index 8192 → false; `fe ff 00 41`
  → false; `ef bb bf 00` → false; `ff` alone → false.

Red evidence: run the tests before the module exists (import fails), then
with rule 1 removed (the BOM cases go red). Paste both.

## Allowed files
src/shared/text/binary.ts, test/unit/binaryDetection.test.ts. Nothing
else — no other src file, no fixtures, no acceptance docs, no coverage
config, no workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list
changed files; paste the red evidence.
