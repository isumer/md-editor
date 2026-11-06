# Slice 8 module part — line operations (Vision lane)

Base: main

A pure module for the Notepad++ line operations. Slice 8 wires it into
commands, the menu and one undo step later (separate dev item). This item
adds no wiring, no IPC and no UI. Criterion AC-R13-02 in
`docs/acceptance/R13-power-tools.md` is planned; do not edit it. No new
dependencies. Commit after each step. Show a red test first (AGENTS.md).

## The module
New file `src/shared/lines/lineOperations.ts`. No imports. It works on an
array of lines without line endings; the caller splits and joins. Exports
exactly:
- `export type SortOrder = "ascending" | "descending" | "ascending-ignore-case" | "descending-ignore-case";`
- `export function sortLines(lines: readonly string[], order: SortOrder): string[]`
- `export function removeDuplicateLines(lines: readonly string[]): string[]`
- `export function removeConsecutiveDuplicateLines(lines: readonly string[]): string[]`
- `export function removeEmptyLines(lines: readonly string[], whitespaceIsEmpty: boolean): string[]`
- `export function trimTrailingWhitespace(lines: readonly string[]): string[]`

Rules:
1. Every function returns a new array and never changes its input.
2. Sorting compares UTF-16 code units (`<`), not `localeCompare`. The
   result must match `LC_ALL=C sort` for ASCII input.
3. Sorting is stable: equal keys keep their input order. For the
   ignore-case orders the key is `toLowerCase()`; equal keys keep input
   order in both directions (descending is not a reversed ascending).
4. `removeDuplicateLines` keeps the first copy of each line at its place.
   Comparison is exact (case and white space count).
5. `removeEmptyLines(lines, false)` removes `""` only;
   `removeEmptyLines(lines, true)` also removes lines of spaces and tabs.
6. `trimTrailingWhitespace` removes trailing spaces and tabs only. It
   keeps other characters, including a no-break space.
7. Each function is linear or `n log n` in the number of lines: use a
   `Set` for duplicates, no nested scans. No function over about 50 lines.

## Tests (`test/unit/lineOperations.test.ts`)
Every title starts `AC-R13-02:`. Read the fixtures as UTF-8 with
`node:fs` and split on `\n` (drop the final empty element).
- `sorts the fixture like C sort` — `sort-dedupe.txt` ascending: 200
  lines; the first three and last three equal the rows in
  `test/fixtures/powertools/README.md`.
- `removes the fixture duplicates` — 200 lines in, 180 out; each kept
  line is at its first-copy position.
- `handles 100,000 lines` — run `generate.mjs 100000` into a temporary
  directory (import or `child_process`, the way the README says), then
  sort and dedupe: 90,000 unique lines; sorted output is non-decreasing.
  Assert counts, not time.
- `keeps a stable order for equal keys` — `["b","B","a","A"]` with
  `ascending-ignore-case` gives `["a","A","b","B"]`; with
  `descending-ignore-case` gives `["b","B","a","A"]`.
- `sorts in code-unit order` — `["é","z","Z","e"]` ascending gives
  `["Z","e","z","é"]`.
- `removes only consecutive duplicates` — `["a","a","b","a"]` gives
  `["a","b","a"]`.
- `removes empty lines` — both modes on `["a",""," \t","b"]`.
- `trims trailing spaces and tabs only` — `"a \t"` gives `"a"`;
  `"a "` stays.
- `never changes the input` — freeze each input (`Object.freeze`) and
  call every function.

Red evidence: run the tests before the module exists (import fails), then
with a non-stable sort or a reversed-ascending descending order
(`keeps a stable order for equal keys` goes red). Paste both.

## Allowed files
`src/shared/lines/lineOperations.ts`, `test/unit/lineOperations.test.ts`.
Nothing else: no other src file, no fixtures, no acceptance docs, no
coverage config, no package.json, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` and
`npm run check:coverage` exit 0: paste each. List the changed files.
Paste the red evidence.
