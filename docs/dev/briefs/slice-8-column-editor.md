# Slice 8 module part — column editor (Vision lane)

Base: main

A pure module for the Notepad++ column editor. Slice 8 wires it into
commands, the menu and one undo step later (separate dev item). This item
adds no wiring, no IPC and no UI. Criterion AC-R13-03 in
`docs/acceptance/R13-power-tools.md` is planned; do not edit it. No new
dependencies. Commit after each step. Show a red test first (AGENTS.md).

## The module
New file `src/shared/lines/columnEditor.ts`. No imports. It works on an
array of lines without line endings; the caller splits and joins. Export
exactly:
- `export function insertTextAtColumn(lines: readonly string[], startLine: number, endLine: number, column: number, text: string): string[]`
- `export function insertNumbersAtColumn(lines: readonly string[], startLine: number, endLine: number, column: number, first: number, step: number): string[]`

Rules:
1. Line numbers are 0-based and `endLine` is inclusive. `column` is
   1-based and at least 1.
2. Throw `RangeError` when `column` is not an integer or is less than 1,
   when `startLine` or `endLine` is not an integer, or when `first` or
   `step` is not a safe integer.
3. Clamp `startLine` and `endLine` to the array bounds. When the clamped
   range is empty (`startLine > endLine`), return a copy of the input.
4. Insert at code-unit index `column - 1`. A line shorter than
   `column - 1` is padded with spaces up to `column - 1` units, then the
   text is added. Do not pad a line that reaches the column.
5. Columns count UTF-16 code units, the unit the editor uses. Never split
   a surrogate pair: when the insertion index falls between a high and a
   low surrogate, move the index back by one.
6. Return a new array and never change the input. Lines outside the
   range are the same strings.
7. `insertNumbersAtColumn` inserts `String(first + step * i)` at the
   column of the i-th line of the range, starting with `i = 0`. It uses
   rule 4 for each line.
8. Each function is at most 50 lines and adds no nested loop over lines
   inside another loop over lines.

## Tests (`test/unit/columnEditor.test.ts`)
Every title starts `AC-R13-03:`. Use exact arrays.
- `inserts text at the column on every line of the range` — `["aa","bb","cc"]`,
  lines 0 to 1, column 2, `"X"` gives `["aXa","bXb","cc"]`.
- `pads a short line with spaces` — `["a","abcd"]`, all lines, column 4,
  `"Z"` gives `["a  Z","abcZ"]`.
- `inserts an increasing number` — `["","",""]`, column 1, first 1, step 1
  gives `["1","2","3"]`.
- `inserts a decreasing number` — `["",""]`, column 1, first 10, step -4
  gives `["10","6"]`.
- `counts columns in code units and never splits a surrogate pair` —
  `["\u{1F600}x"]`, column 2, `"Z"` gives `["Z\u{1F600}x"]`.
- `clamps a range past the end of the lines` — `["a","b","c"]`, lines 1
  to 99, column 1, `"X"` gives `["a","Xb","Xc"]`.
- `returns a copy when the range is empty` — lines 2 to 1 gives an equal
  array, not the same array.
- `throws RangeError for an invalid column` — column 0 and column 1.5.
- `throws RangeError for an invalid line number` — `startLine` 0.5.
- `never changes the input` — freeze the input array and call both
  functions.

Red evidence: run the tests before the module exists (import fails), then
remove the padding step (`pads a short line with spaces` goes red), then
remove the surrogate-pair guard (`counts columns in code units and never
splits a surrogate pair` goes red). Paste all three.

## Allowed files
`src/shared/lines/columnEditor.ts`, `test/unit/columnEditor.test.ts`.
Nothing else: no other src file, no fixtures, no acceptance docs, no
coverage config, no package.json, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` and
`npm run check:coverage` exit 0: paste each. List the changed files.
Paste the red evidence.
