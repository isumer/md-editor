# Slice 7 module part — line endings (Karen lane)

Base: main

A pure module that detects and applies line endings. Slice 7 wires it
into load and save later (dev lane). This item adds no wiring, no IPC and
no UI. Criterion AC-R12-03 in `docs/acceptance/R12-text-editing.md` is
planned; do not edit it. No new dependencies.

## The module
New file `src/shared/text/lineEndings.ts`. No imports. Exports exactly:
- `export type LineEnding = 'crlf' | 'lf' | 'cr';`
- `export function detectLineEnding(text: string): LineEnding | undefined`
- `export function applyLineEnding(text: string, ending: LineEnding): string`

Rules, in this order:
1. Scan once from index 0. `\r\n` is one CRLF break. Any other `\r` is
   one CR break. Any other `\n` is one LF break.
2. `detectLineEnding` returns the kind with the most breaks.
3. On a tie, `detectLineEnding` returns the kind whose first break comes
   first in the text.
4. `detectLineEnding` returns `undefined` when the text has no break or
   is empty.
5. `applyLineEnding` replaces every break with the given kind. It keeps a
   final break when the text has one. Text without a break comes back
   unchanged.
6. `applyLineEnding` is idempotent.
7. Do not mutate inputs. Do not use a backtracking regular expression.

## Tests (`test/unit/lineEndings.test.ts`)
Every title starts `AC-R12-03:`. Read the fixtures with `node:fs`.
- `detects the fixture line endings` — `test/fixtures/encodings/crlf.txt`
  read as UTF-8 gives `crlf`. `test/fixtures/golden/crlf-line-endings.md`
  read as UTF-8 gives `crlf`.
- `detects each single kind` — `"a\nb\n"` gives `lf`,
  `"a\r\nb\r\n"` gives `crlf`, `"a\rb\r"` gives `cr`.
- `takes the most frequent kind` — `"a\r\nb\r\nc\n"` gives `crlf`.
- `breaks a tie by the first occurrence` — `"a\r\nb\n"` gives `crlf`;
  `"a\nb\r\n"` gives `lf`.
- `reports no kind without a break` — `""` and `"abc"` give `undefined`.
- `applies a kind to every break` —
  `applyLineEnding("a\nb\r\nc", "crlf")` is `"a\r\nb\r\nc"`;
  `applyLineEnding("a\r\nb", "lf")` is `"a\nb"`;
  `applyLineEnding("a\nb", "cr")` is `"a\rb"`.
- `keeps a final line break` — `applyLineEnding("a\nb\n", "crlf")` is
  `"a\r\nb\r\n"`; `applyLineEnding("a\nb", "crlf")` is `"a\r\nb"`.
- `leaves text without a break unchanged` — `""` and `"abc"`.
- `is idempotent` — applying `crlf` twice gives the same text.
- `round-trips the CRLF fixture` — read `crlf.txt` as UTF-8, apply
  `crlf` and get the same string; its byte length is 20.

Red evidence: run the tests before the module exists (import fails),
then with the CRLF branch removed so `\r` counts alone (the mixed and
round-trip tests go red). Paste both.

## Allowed files
src/shared/text/lineEndings.ts, test/unit/lineEndings.test.ts. Nothing
else — no other src file, no fixtures, no acceptance docs, no coverage
config, no workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list
changed files; paste the red evidence.
