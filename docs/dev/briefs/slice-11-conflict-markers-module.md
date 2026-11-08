# Slice 11 module part — parse a file with conflict markers (dev lane)

Base: main

A pure module that splits a file containing conflict markers into its two
sides. Slice 11 wiring opens such a file in the merge view (dev lane) and
consumes it. This item adds no wiring, no IPC and no UI. Criterion
AC-R15-06 is planned; do not edit it. No new dependencies.

## The module
New file `src/shared/merge/conflictMarkers.ts`. It imports nothing.

Exports exactly:
- `export interface MarkerRange { readonly start: number; readonly end: number; }`
- `export interface ConflictBlock { readonly left: MarkerRange; readonly right: MarkerRange; }`
- `export interface ConflictFile { readonly left: string; readonly right: string; readonly conflicts: readonly ConflictBlock[]; }`
- `export type ConflictParseFailure = 'start-without-separator' | 'start-without-end' | 'separator-outside-block' | 'end-outside-block';`
- `export type ConflictParseResult = { readonly ok: true; readonly file: ConflictFile } | { readonly ok: false; readonly reason: ConflictParseFailure };`
- `export function parseConflictFile(text: string): ConflictParseResult`

## Rules, in this order
1. Split `text` at `\n`. The line ending stays with its line; a `\r`
   before the `\n` is part of the line ending, not of the marker. All
   offsets are UTF-16 offsets in `text`.
2. A line is a start marker when it begins with seven `<` characters,
   a separator when its first seven characters are `=` and nothing but an
   optional `\r` follows, and an end marker when it begins with seven `>`
   characters. A label after a start or end marker is allowed and ignored.
3. Outside a block, each line belongs to both sides unchanged.
4. Inside a block, the lines between the start marker and the separator
   are the left side; the lines between the separator and the end marker
   are the right side. Each side keeps its own line endings. Blocks do
   not nest.
5. On success, `left` is the text with each block replaced by its left
   lines, and `right` likewise with its right lines. `conflicts` holds one
   entry per block in document order. Each range is `{ start, end }` with
   start inclusive and end exclusive, in its own side's text.
6. A failure returns `ok: false` with the first reason in document order:
   a start marker with no separator before the next start marker or the
   end of the text, a block with no end marker, a separator outside a
   block, an end marker outside a block.
7. The function never throws and never changes `text`.

## Tests (`test/unit/conflictMarkers.test.ts`)
Every title starts `AC-R15-06:`. Build documents as plain strings.
- `splits one block into two sides` — one block with text before and
  after it; assert both texts and the exact ranges.
- `keeps text outside the blocks on both sides`.
- `reports two blocks in document order` — assert both ranges.
- `accepts CRLF line endings and keeps them` — assert the exact texts.
- `ignores the labels after the markers`.
- `accepts an empty side` — the left side has no lines.
- `reports a start marker with no separator`.
- `reports a start marker with no end marker`.
- `reports a separator outside a block`.
- `reports an end marker outside a block`.
- `does not change the input` — pass a frozen string copy and compare.

Red evidence: run the tests before the module exists (import fails), then
with the separator branch removed so a separator outside a block is
treated as text (that test goes red). Paste both.

## Allowed files
src/shared/merge/conflictMarkers.ts, test/unit/conflictMarkers.test.ts.
Nothing else — no other src file, no fixtures, no acceptance docs, no
coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
