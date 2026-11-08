# Slice 11 module part — merge chunk model (dev lane)

Base: main

A pure module that holds the chunks of a three-way merge and computes
the centre-text edits for accepting chunks. The merge view wiring
(later dev item) dispatches each returned edit list as one transaction
in the centre Document, so CodeMirror history gives one Undo per call
(architecture §4.2). This item adds no wiring, no IPC and no UI. It
does not compute chunks: the three-way diff (later item) produces them.
Criteria AC-R15-04, AC-R15-05 and AC-R15-10 stay planned; do not edit
them. No new dependencies.

Parts: this module only. Owned files: see "Allowed files".
Depends on: main.

## The module
New file `src/shared/merge/mergeChunks.ts`. It imports nothing.

Exports exactly:
- `export type ChunkKind = 'change' | 'conflict';`
- `export type ChunkChoice = 'left' | 'right' | 'both';`
- `export interface MergeChunk { readonly kind: ChunkKind; readonly start: number; readonly end: number; readonly left: string; readonly right: string; }`
  `start`/`end` is the chunk's range in the centre text (start
  inclusive, end exclusive, UTF-16 offsets). For a `change`, the side
  that changed is the text to apply; the wiring passes it in both
  `left` and `right` when only one side changed it or both made the
  same change.
- `export interface TextEdit { readonly from: number; readonly to: number; readonly insert: string; }`
- `export interface MergeState { readonly chunks: readonly MergeChunk[]; readonly resolved: readonly boolean[]; }`
- `export interface MergeStep { readonly state: MergeState; readonly edits: readonly TextEdit[]; }`
- `export interface MergeCounts { readonly changesLeft: number; readonly conflictsLeft: number; }`
- `export function createMergeState(chunks: readonly MergeChunk[]): MergeState`
- `export function acceptChunk(state: MergeState, index: number, choice: ChunkChoice): MergeStep`
- `export function applyNonConflicting(state: MergeState): MergeStep`
- `export function mergeCounts(state: MergeState): MergeCounts`
- `export function nextChunk(state: MergeState, offset: number, kind: ChunkKind): number | null`
- `export function previousChunk(state: MergeState, offset: number, kind: ChunkKind): number | null`

## Rules
1. `createMergeState` throws `RangeError` unless every chunk has
   integer `0 <= start <= end`, and each chunk starts at or after the
   end of the one before it. All chunks start unresolved.
2. `acceptChunk` throws `RangeError` for an index that is not an
   integer in range, and for a chunk that is already resolved.
   `choice` `left` inserts `left`, `right` inserts `right`, `both`
   inserts `left` followed by `right`. The single edit replaces
   `start..end` of the chunk.
3. After an edit, every later chunk's `start` and `end` shift by
   `insert.length - (to - from)`. The accepted chunk becomes resolved
   and its range becomes the inserted text's range.
4. `applyNonConflicting` accepts every unresolved `change` chunk with
   its `left` text, in one `MergeStep`. Its edits are in document
   order with offsets in the text before the step (one transaction).
   With no unresolved change it returns the same state and no edits.
5. `mergeCounts` counts unresolved chunks by kind.
6. `nextChunk` returns the index of the first unresolved chunk of
   `kind` whose `start` is greater than `offset`; `previousChunk` the
   last one whose `start` is less than `offset`. No wrap-around: return
   `null` when there is none (F7 / Shift+F7, AC-R15-10).
7. No function changes its arguments. State is immutable: each step
   returns new arrays.

## Tests (`test/unit/mergeChunks.test.ts`)
Build the centre text as a plain string and apply the returned edits
in the test (a small helper in the test file) to check the result.
- `AC-R15-04: accepting left puts the left text in the centre`.
- `AC-R15-04: accepting both puts left then right` — exact text.
- `AC-R15-04: accepting a chunk shifts the later chunks` — accept the
  first of two chunks with a longer text; accept the second; assert
  the final text.
- `AC-R15-04: a resolved chunk cannot be accepted again`.
- `AC-R15-04: the counter drops after an accept`.
- `AC-R15-05: applying non-conflicting changes is one step` — five
  changes and two conflicts: one call, five edits, final text exact,
  counts `{ changesLeft: 0, conflictsLeft: 2 }`.
- `AC-R15-05: applying with no change left returns no edits`.
- `AC-R15-10: next and previous skip resolved chunks and the other kind`.
- `AC-R15-10: navigation returns null past the last chunk`.
- `AC-R15-04: rejects overlapping, negative and fractional ranges`.
- `AC-R15-04: rejects an index out of range`.
- `AC-R15-04: does not change its arguments` — freeze the input
  chunks and state.

Red evidence: run the tests before the module exists (import fails),
then with rule 3's shift removed (the shift test goes red). Paste both.

## Allowed files
src/shared/merge/mergeChunks.ts, test/unit/mergeChunks.test.ts.
Nothing else — no other src file, no fixtures, no acceptance docs, no
coverage config, no workflows.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit` exit 0 —
paste. List changed files. Paste the red evidence.
