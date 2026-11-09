# Slice 11 fix 2 - prove the fix base for the merge chunk model (dev lane)

Base: main (continues the PR branch feature/slice11-merge-chunks)

The Vision gate on candidate bf85c7a (job 1023) found one Major: the
branch diff adds src/shared/merge/mergeChunks.ts, which the fix brief
does not allow. That finding does not hold. The module is part 1 of the
same PR, and main does not hold it yet. The fix commit 6261cfe changes
only test/unit/mergeChunks.test.ts (+8 lines). The module blob is
identical to the module part 699f5d3.

The finding has one real cause. The fix brief's "Done means" line asked
for a branch diff against main that names only the test file. That is
impossible for a PR branch whose module is not on main yet. The review
corrected that line on main.

Do not change the module or the test. Merge current main into the PR
branch and paste the proof below. The merge puts the PR on current main,
so the candidate can fast-forward main when CI is green.

## Allowed files
None. Change no source file. The only new commit is the merge.

If the merge conflicts, stop and report FAILED with the conflicting
paths. Do not resolve a conflict by editing the module or the test.

## Steps
1. The lane normally starts you from feature/slice11-merge-chunks.
   Merge origin/main into it. Keep both sides.
   If the lane starts you from main instead, merge
   origin/feature/slice11-merge-chunks into your branch, then stop;
   do not merge main again.
2. Do not rebase, amend or force-push.
3. Paste these proofs:
   - `git rev-parse HEAD:src/shared/merge/mergeChunks.ts 699f5d3:src/shared/merge/mergeChunks.ts`
     Both hashes must be 21ca8929981e8d021c423a7da528bf1ccaab9870.
   - `git show --stat 6261cfe` must name only
     test/unit/mergeChunks.test.ts, +8 lines.
   - `git diff --stat origin/main...HEAD` must name exactly
     src/shared/merge/mergeChunks.ts and test/unit/mergeChunks.test.ts.
     The module file is part 1 of this PR; that is correct.
   - `git merge-base --is-ancestor origin/main HEAD; echo $?` must
     print 0.

## Red evidence
The reversed-range guard has its test. Paste your own run:
1. Delete `chunk.start <= chunk.end &&` from
   src/shared/merge/mergeChunks.ts:38.
2. Run `npm run test:unit -- test/unit/mergeChunks.test.ts`.
   `AC-R15-04: rejects a reversed range` must fail. The other 16
   tests must pass.
3. Restore the line. Run the file again: 17 tests pass.

## Done means
- The only new commit is the merge. No file changed.
- The four proofs above are pasted and correct.
- `npm run typecheck`, `npm run test:unit`, `npm run check:acceptance`
  and `npm run verify` exit 0; paste their summary lines. The
  Electron lock is shared: queue for it, and report the log line if it
  still cannot be taken.
- AC-R15-04/-05/-10 stay planned; the module is unwired.
