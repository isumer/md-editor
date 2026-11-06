# Slice 8 module part — word completion (NIM lane)

Base: main

A pure module that suggests words from the document for the word being
typed. Slice 8 wiring consumes it later (dev lane). This item adds no
wiring, no IPC and no UI. The criterion AC-R13-04 is planned; do not
edit it. No new dependencies.

## The module
New file `src/shared/text/wordCompletion.ts`. It imports nothing.

Exports exactly:
- `export interface WordAtCursor { readonly prefix: string; readonly start: number; }`
- `export function wordAt(text: string, cursorOffset: number): WordAtCursor`
- `export function completeWord(text: string, cursorOffset: number, maxWords?: number): readonly string[]`

A word character is a Unicode letter, a Unicode digit or `_`. Test it
with `/\p{L}|\p{N}|_/u` or an equivalent character class.

## Rules, in this order
1. `wordAt` returns the maximal run of word characters that ends at
   `cursorOffset`. `start` is the offset of the first character of the
   run; `prefix` is `text.slice(start, cursorOffset)`. When the character
   before the cursor is not a word character, both are `""` and
   `cursorOffset`.
2. Out-of-range offsets are clamped: a negative offset acts as 0, and an
   offset above `text.length` acts as `text.length`. The function never
   throws.
3. `completeWord` returns an empty array when `prefix.length < 2`.
4. `completeWord` scans the whole text once, in document order, and
   collects maximal word runs. A run is a candidate when its length is
   greater than the prefix length and its lowercased form starts with
   the lowercased prefix. The run at the cursor itself (the run whose
   start equals `wordAt(...).start`) is not a candidate.
5. Deduplicate case-insensitively and keep the first spelling in
   document order. Return at most `maxWords` words; the default is 20.
   A `maxWords` of 0 or less returns an empty array.
6. The input string is never changed. Do not build an array of every
   word: keep only the accepted candidates.

## Tests (`test/unit/wordCompletion.test.ts`)
Every title starts `AC-R13-04:`. Build documents as plain strings.
- `finds the word before the cursor` — the prefix, the start and a
  prefix of length 1.
- `returns an empty prefix at a non-word character`.
- `clamps offsets outside the text` — a negative offset and an offset
  past the end.
- `suggests words that start with the prefix` — two matches, with a
  non-matching word and a shorter word in the text.
- `matches case-insensitively and keeps the first spelling` — the
  prefix `Hel` and the text contains `hello` and `Hello`.
- `returns each word once` — the same word three times gives one entry.
- `keeps document order and the limit` — five matches with `maxWords`
  3 returns the first three in document order.
- `ignores the word at the cursor` — the only match is the word being
  typed.
- `needs at least two characters` — a one-character prefix gives no
  words.
- `treats a zero limit as no words`.
- `handles Unicode letters` — the text contains `Ärger` and the prefix
  is `Är`; the word is suggested.

Red evidence: run the tests before the module exists (import fails),
then with rule 4's length comparison (`>`) changed to `>=` (the test
that ignores the word at the cursor goes red). Paste both.

## Allowed files
src/shared/text/wordCompletion.ts, test/unit/wordCompletion.test.ts.
Nothing else — no other src file, no fixtures, no acceptance docs, no
coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
