# Slice 8 module part — command palette matching (R13)

Base: main

Branch `feature/slice8-palette-match`. Follow AGENTS.md. A pure module
that filters and ranks commands for the command palette. Slice 8 wiring
consumes it later (dev lane). This item adds no wiring, no IPC and no UI.
The criterion AC-R13-06 is planned; do not edit it. No new dependencies.

Depends on: main only. Parts: this module part only.

## The module
New file `src/shared/commands/paletteMatch.ts`. It imports nothing.

Exports exactly:
- `export interface PaletteEntry { readonly id: string; readonly title: string; }`
- `export interface PaletteMatch { readonly id: string; readonly title: string; readonly score: number; readonly positions: readonly number[]; }`
- `export function matchTitle(query: string, title: string): { readonly score: number; readonly positions: readonly number[] } | undefined`
- `export function rankCommands(query: string, entries: readonly PaletteEntry[], recentIds?: readonly string[], maxResults?: number): readonly PaletteMatch[]`

## Rules, in this order
1. Remove all whitespace from the query. Compare characters
   case-insensitively: a query character matches a title character when
   their `toLowerCase()` values are equal. Work in UTF-16 code units.
2. `matchTitle` finds the leftmost greedy subsequence: each query
   character takes the first matching title index after the previous
   one. No full match returns `undefined`. `positions` are those title
   indexes, ascending. An empty query returns score 0 and no positions.
3. Score: each matched character gives 1. A match at index 0, or after a
   title character that is not a Unicode letter or digit, gives 5 more.
   A match at the index right after the previous match gives 3 more.
4. `rankCommands` keeps only the first entry for each id. It drops
   entries that do not match.
5. Order: higher score first. Then an id in `recentIds` before one that
   is not, and an earlier `recentIds` index first. Then title in
   code-unit order. Then id in code-unit order. With an empty query, all
   scores are 0, so recent entries come first.
6. Return at most `maxResults` matches; the default is 50. A
   `maxResults` of 0 or less, or one that is not an integer, returns an
   empty array.
7. The inputs are never changed. The functions never throw for any
   string input.

## Tests (`test/unit/paletteMatch.test.ts`)
Every title starts `AC-R13-06:`. Assert exact scores and positions.
- `matches a subsequence case-insensitively` — query `oF` on
  `Open File`: positions [0, 5], score 12.
- `scores consecutive characters` — query `ope` on `Open`: score
  (1 + 5) + (1 + 3) + (1 + 3) = 14, positions [0, 1, 2].
- `uses the leftmost greedy match` — query `ab` on `xaab`: positions
  [1, 3].
- `ignores whitespace in the query`.
- `returns no match for a missing character`.
- `ranks by score, then recent, then title, then id` — one test per tie
  level, with exact output ids.
- `lists recent commands first for an empty query`.
- `keeps the first entry for a duplicate id`.
- `applies the limit` — default 50 with 60 entries; 3; 0; -1; 2.5.
- `never changes the inputs` — frozen arrays and entries.
- `handles Unicode letters` — `Ä` in a title counts as a letter for
  rule 3: query `ä` on `xÄ` matches at 1 with no word-start bonus.

Red evidence: run the tests before the module exists (import fails).
Then change rule 3's consecutive bonus from 3 to 0. Paste both runs.

## Allowed files
`src/shared/commands/paletteMatch.ts`, `test/unit/paletteMatch.test.ts`.
Nothing else — no other src file, no fixtures, no acceptance docs, no
coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
