# Slice 7 module part — find and replace (side lane)

Base: main

A pure module for literal and regular-expression find and replace. Slice
7 wires it into the editor later (dev lane). This item adds no wiring, no
IPC and no UI. Criterion AC-R12-04 in
`docs/acceptance/R12-text-editing.md` is planned; do not edit it. No new
dependencies.

## The module
New file `src/shared/text/findReplace.ts`. No imports. Exports exactly:
- `export interface FindOptions { matchCase: boolean; wholeWord: boolean; regex: boolean; }`
- `export interface TextMatch { start: number; end: number; }`
- `export function findMatches(text: string, query: string, options: FindOptions): TextMatch[]`
- `export function replaceAll(text: string, query: string, replacement: string, options: FindOptions): { text: string; count: number }`

Rules, in this order:
1. An empty query gives `[]`. `replaceAll` then returns the text
   unchanged with count 0.
2. Build a regular expression. In literal mode (`regex: false`) escape
   every regular-expression metacharacter in the query first. In regex
   mode use the query as written. Use flag `g`, plus `i` when
   `matchCase` is false.
3. A query that throws gives `[]`. `replaceAll` then returns the text
   unchanged with count 0. It must not throw.
4. Matches are non-overlapping and found from left to right. `start` and
   `end` are UTF-16 code-unit offsets.
5. Drop a zero-length match and advance the scan by one UTF-16 code
   unit.
6. In `wholeWord` mode keep a match only when the character before
   `start` and the character after `end` are not a letter, a number or
   `_` (`/[\p{L}\p{N}_]/u`). The start and end of the text count as no
   character. This filter applies in both modes and does not change the
   regular expression.
7. `replaceAll` rewrites every kept match from left to right. In literal
   mode it inserts the replacement exactly. In regex mode it expands
   `$&` (the match), `$1`..`$99` (capture groups) and `$$` (a literal
   `$`); every other `$` sequence stays as written. A group that did not
   participate expands to the empty string.
8. `count` is the number of kept matches. Do not mutate inputs.

## Tests (`test/unit/findReplace.test.ts`)
Every title starts `AC-R12-04:`. Read the fixtures in
`test/fixtures/find-replace/` with `node:fs`.
- `matches the mixed-case fixture` — exact counts from its README:
  `Cat` 3, `cat` 5, `CAT` 2, `cAt` 2, `catalog` 2, and `cat` with
  `matchCase: false` 12; whole-word `cat` 3.
- `matches the whole-word fixture` — whole-word `cat` 5; `cats` 2;
  `copycat` 2; `concatenate` 2; substring `cat` 11.
- `treats metacharacters literally` — on `regex-meta.md` in literal
  mode: `.` 4; each of `* + ? [ ] ( ) { } ^ $ | \` 2; `a.c` 2.
- `matches Unicode text by code unit` — on `unicode.md`: `ğ`, `ü`, `ş`,
  `ı`, `ö`, `ç` and `İ` each 2, and `i` 4. Assert the exact `start` and
  `end` of the first `İ` match.
- `supports regular expressions` — `findMatches("a1 b2", "([a-z])(\\d)",
  {matchCase: true, wholeWord: false, regex: true})` gives 2 matches at
  `{start: 0, end: 2}` and `{start: 3, end: 5}`.
- `filters whole-word matches in both modes` — on `whole-words.md`,
  whole-word `cat` gives the same 5 matches with and without `regex`.
- `drops zero-length matches` — regex `^` on `"ab"` gives no matches;
  regex `x*` on `"ab"` gives no matches; regex `a*` on `"aab"` gives one
  match at `{start: 0, end: 2}`.
- `rejects an invalid regular expression` — `(` gives `[]`;
  `replaceAll` returns the text unchanged with count 0 and does not
  throw.
- `replaces literal text exactly` — on `regex-meta.md`, replace `.` with
  `X` gives 4 replacements; a replacement of `$&` stays literal.
- `expands groups in regex mode` — `replaceAll("a1 b2", "([a-z])(\\d)",
  "$2$1", {matchCase: true, wholeWord: false, regex: true})` is `"1a 2b"`
  with count 2; `$$` gives `$`; `$&` gives the match; `$9` gives the
  empty string.
- `keeps the text when nothing matches` — count 0 and the text is
  unchanged.

Red evidence: run the tests before the module exists (import fails),
then with the literal escaping removed (the metacharacter tests go red).
Paste both.

## Allowed files
src/shared/text/findReplace.ts, test/unit/findReplace.test.ts. Nothing
else — no other src file, no fixtures, no acceptance docs, no coverage
config, no workflows.

## Done means
typecheck, check:deps, test:unit, check:coverage exit 0 — paste; list
changed files; paste the red evidence.
