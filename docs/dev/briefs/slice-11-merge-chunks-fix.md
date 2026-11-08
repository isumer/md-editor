# Slice 11 fix - reversed-range test for the merge chunk model (dev lane)

Base: main (continues the PR branch feature/slice11-merge-chunks)

The Vision gate on candidate 699f5d3 found one Major: the reversed-range
guard has no test. This review confirmed it. Removing
`chunk.start <= chunk.end` at `src/shared/merge/mergeChunks.ts:38` left
all 16 merge-chunk tests green. Rule 1 of the module brief requires
`0 <= start <= end`, but the test list and the test file cover only
overlapping, negative and fractional ranges.

The guard is correct. This fix adds the missing test. Do not change the
module.

## Allowed files
test/unit/mergeChunks.test.ts.

Nothing else. A temporary edit to `src/shared/merge/mergeChunks.ts` is
allowed only for the red evidence below. Restore it before you commit:
the final diff must contain the test file only.

## The test
Add one test to `test/unit/mergeChunks.test.ts`, in the same style as
its neighbours:

- `AC-R15-04: rejects a reversed range`

  `createMergeState([{ kind: 'change', start: 4, end: 2, left: '', right: '' }])`
  must throw `RangeError`. Assert it with
  `expect(() => ...).toThrow(RangeError)`.

## Red evidence
1. Delete `chunk.start <= chunk.end &&` from
   `src/shared/merge/mergeChunks.ts:38`.
2. Run `npm run test:unit -- test/unit/mergeChunks.test.ts`.
   The new test must fail and the other 16 tests must pass.
3. Restore the line. Run the file again: 17 tests pass.

Paste both runs.

## Done means
- `git diff --stat origin/main...HEAD` names only
  `test/unit/mergeChunks.test.ts` (plus the commit itself).
- `npm run typecheck`, `npm run test:unit`, `npm run check:acceptance`
  exit 0; paste their summary lines. Run the full `npm run verify` if
  the Electron lock is free; do not wait more than 10 minutes for it.
- Commit on the PR branch with a message that names the test and the
  guard. Do not amend or rebase the existing commits.
