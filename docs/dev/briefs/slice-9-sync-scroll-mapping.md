# Slice 9 module part — map scroll anchors (dev lane)

Base: main

A pure module that maps a source line to a preview scroll offset and back.
Slice 9 wiring consumes it for sync scroll. This item adds no wiring, no
DOM access and no UI. Criteria AC-R3-01 and AC-R3-02 stay planned; do not
edit them. No new dependencies.

## The module
New file `src/renderer/features/sync-scroll/mapping.ts`. It imports nothing.

Exports exactly:
- `export interface SyncAnchor { readonly sourceLine: number; readonly blockTop: number; readonly blockHeight: number; }`
- `export function previewTopForLine(anchors: readonly SyncAnchor[], sourceLine: number, maxTop: number): number`
- `export function sourceLineForPreviewTop(anchors: readonly SyncAnchor[], top: number): number`

## Rules, in this order
1. An anchor marks a rendered block. `sourceLine` is the 1-based line of
   its first line in the document. `blockTop` is the block's top offset in
   the preview, in pixels. `blockHeight` is its height in pixels.
2. The caller passes a list that is already sorted and unique: both
   `sourceLine` and `blockTop` increase strictly, `blockTop` is at least 0,
   `blockHeight` is at least 0, and `maxTop` is at least 0. The functions
   do not sort, do not copy and do not change the list. A list that breaks
   these rules is a caller bug.
3. Both functions use binary search. They do no DOM read, allocate nothing
   per call beyond the number they return, and never throw.
4. `previewTopForLine` returns a number in `[0, maxTop]`.
   - An empty list returns 0.
   - A line at or before the first anchor's line returns that anchor's
     `blockTop`, clamped to `maxTop`.
   - A line at or after the last anchor's line returns that anchor's
     `blockTop`, clamped to `maxTop`.
   - Otherwise find anchor A with the greatest line that is not after the
     input, and the next anchor B. If the input equals A's line, return A's
     `blockTop`. Else return
     `A.blockTop + (line - A.sourceLine) / (B.sourceLine - A.sourceLine) * (B.blockTop - A.blockTop)`,
     clamped to `[0, maxTop]`.
5. `sourceLineForPreviewTop` returns an integer in
   `[first.sourceLine, last.sourceLine]`.
   - An empty list returns 1.
   - A top at or before the first anchor's `blockTop` returns its line.
   - A top at or after the last anchor's `blockTop` returns its line.
   - Otherwise find anchor A with the greatest `blockTop` that is not after
     the input, and the next anchor B. If the input equals A's `blockTop`,
     return A's line. Else return
     `Math.round(A.sourceLine + (top - A.blockTop) / (B.blockTop - A.blockTop) * (B.sourceLine - A.sourceLine))`.
6. The two functions are inverse at each anchor: a line equal to an
   anchor's `sourceLine` gives that anchor's `blockTop`, and that
   `blockTop` gives that `sourceLine`.

## Tests (`test/unit/syncScrollMapping.test.ts`)
Every title starts `AC-R3-01:` or `AC-R3-02:`.
- `AC-R3-01: returns the block top at every anchor line` — five anchors.
- `AC-R3-01: interpolates between two anchors` — line 15 between lines 10
  and 20, tops 100 and 300, gives 200.
- `AC-R3-01: clamps before the first anchor and after the last`.
- `AC-R3-01: clamps to the top bound` — a `maxTop` below the result.
- `AC-R3-01: interpolates inside one tall block` — lines 1 and 100, tops 0
  and 1000; line 50 gives 500.
- `AC-R3-01: returns 0 for an empty list`.
- `AC-R3-02: returns the line at every anchor top`.
- `AC-R3-02: interpolates between two anchors and rounds` — top 250
  between tops 100 and 300 with lines 10 and 20 gives 15.
- `AC-R3-02: clamps at both ends` — a top below the first `blockTop`
  gives the first line; a top above the last gives the last line.
- `AC-R3-02: returns 1 for an empty list`.
- `AC-R3-02: uses one anchor for every top` — a single anchor.
- `AC-R3-01: never decreases as the line grows` — 1,000 seeded lines.
- `AC-R3-02: never decreases as the top grows` — 1,000 seeded tops.
- `AC-R3-01: does not change the input` — frozen list compared after calls.
- `AC-R3-01: finds an anchor in a long list quickly` — 20,000 anchors,
  then 100,000 calls; assert the results and a 2 s bound.

Red evidence: run the tests before the module exists (import fails). Then
drop the `maxTop` clamp so `AC-R3-01: clamps to the top bound` is red.
Paste both runs.

## Allowed files
src/renderer/features/sync-scroll/mapping.ts,
test/unit/syncScrollMapping.test.ts. Nothing else — no other src file, no
fixtures, no acceptance docs, no coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
