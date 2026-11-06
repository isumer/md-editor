# Slice 7 module part — decode text in a chosen encoding (Karen lane)

Base: main

A pure module that decodes file bytes in a chosen encoding. Slice 7
wires it into load later (dev lane). This item adds no wiring, no IPC and
no UI. Criterion AC-R12-05 in `docs/acceptance/R12-text-editing.md` is
planned; do not edit it. No new dependencies: use the platform
`TextDecoder`.

## The module
New file `src/shared/text/encoding.ts`. No imports. Exports exactly:
- `export type TextEncoding = 'utf-8' | 'utf-16le' | 'windows-1254';`
- `export type DecodeResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: 'invalid' };`
- `export function decodeText(bytes: Uint8Array, encoding: TextEncoding): DecodeResult`

Rules, in this order:
1. Strip one leading byte order mark when it matches the encoding:
   `ef bb bf` for `'utf-8'`, `ff fe` for `'utf-16le'`, none for
   `'windows-1254'`. Strip a BOM only at the start of `bytes`.
2. Decode the remaining bytes with `new TextDecoder(encoding, { fatal: true })`.
   The labels are the same strings as the type.
3. Never throw. A failed decode returns `{ ok: false, reason: 'invalid' }`.
   A success returns `{ ok: true, text }`.
4. Do not mutate `bytes`.

## Tests (`test/unit/encoding.test.ts`)
Every title starts `AC-R12-05:`. Read the fixtures with `node:fs` as
`Uint8Array`.
- `decodes the Windows-1254 fixture` — `windows-1254.txt` gives the six
  characters with code points 0x11f, 0xfc, 0x15f, 0x131, 0xf6 and 0xe7,
  then CR LF, then `turkish`, then CR LF. Build the expected string with
  `String.fromCharCode`, so the test file stays ASCII.
- `decodes a UTF-8 fixture without a BOM` — `crlf.txt` gives
  `"alpha\r\nbeta\r\ngamma\r\n"`.
- `removes a UTF-8 byte order mark` — `utf8-bom.txt` gives `"hello\n"`.
- `removes a UTF-16LE byte order mark` — `utf16le.txt` gives `"hello\n"`.
- `refuses bytes that are invalid for the encoding` — `new Uint8Array([0xff])`
  as `'utf-8'` and `new Uint8Array([0x41])` as `'utf-16le'` are failures.
- `does not mutate the input` — pass a frozen copy and compare the bytes
  after the call.

Red evidence: run the tests before the module exists (import fails), then
with the BOM strip removed so `utf8-bom.txt` keeps U+FEFF (the two BOM
tests go red). Paste both.

## Allowed files
src/shared/text/encoding.ts, test/unit/encoding.test.ts. Nothing else —
no other src file, no fixtures, no acceptance docs, no coverage config,
no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
