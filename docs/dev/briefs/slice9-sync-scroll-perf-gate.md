# Slice 9 sync-scroll fix - record the performance evidence for the sync PR (dev lane)

Base: feature/slice9-sync-scroll-mapping at 25df356 (this job continues that PR branch)

The Vision gate on candidate 25df356 (job 1132) returned FIX with two Blockers.
Both are 20 MB performance rows measured on this Raspberry Pi host:

- AC-PERF-09 (test/e2e/preview-perf.spec.ts:392): the 20 MB scroll fling found
  two frames of 33.3 ms. The budget is 32 ms.
- AC-PERF-11 (test/e2e/preview-perf.spec.ts:474): the first preview of the 20 MB
  file appeared after 1,000 ms. The budget requires less than 1,000 ms.

Those rows do not block a merge on this host. `docs/acceptance/PERF-response-time.md`
(platform rule, lines 74 to 81; user decision of 2026-11-05) says: the 20 MB rows
of AC-PERF-09, AC-PERF-10 and AC-PERF-11 are enforced on desktop-class CI runners
only (GitHub ubuntu, windows, macOS); the Raspberry Pi runs them as information;
a merge must not be blocked on them; the 32 ms and 1 s budgets are not widened.
CI records a product defect if it sees a frame or a first screen over budget, and
that defect has its own item in the work graph (perf-open-long-task chain).

This branch has no runtime path to those rows. Its whole diff against main is
11 added lines in test/unit/syncScrollMapping.test.ts. `src` has no diff:
mapping.ts is byte-identical to main (258dcbb), and nothing outside
src/renderer/features/sync-scroll/ imports the module. The branch wires nothing.

The same commit measured both ways on this host. Review job 1129 ran a full
`locked-npm run verify` on 25df356 and it passed, e2e included, exit 0. Job 1132
ran the same command on the same commit and saw the two rows above fail. The rows
are borderline on this host; the platform rule assigns their enforcement to CI.

CI status. The branch code tip 4ff24c2 passed every CI leg: run 42562841223 is
green (ubuntu, and the PR legs). The candidate push run 42567255770 failed at
"Download the Electron binary": GitHub returned HTTP 504 for the Electron zip on
the ubuntu, macOS and package legs. Main's run 42567341990 failed the same way at
the same minutes. That is infrastructure, not a test failure: no test ran.
The new candidate you push gets a fresh CI run on the desktop-class runners,
where these budgets are enforced.

Do not change any performance code, any test, any threshold, any budget, any
wait, any retry, any skip and any baseline. The fix is to write the evidence
into the branch so the next gate can read it.

## Allowed files

- `docs/reviews/2026-11-09-slice9-sync-scroll-perf-verification.md` (new file)

Change no other file. Do not add a package.

## 1. Merge current main

Check the base: `git merge-base --is-ancestor origin/main HEAD; echo $?` must
print 0. If it prints 1, merge origin/main and commit the merge. Do not rebase,
amend or force-push.

## 2. Write the evidence note

The new file must state these facts, each with its proof:

- The branch adds only test lines against main. Paste
  `git diff --stat origin/main...HEAD` and
  `git diff origin/main...HEAD -- src` (the second must be empty).
- Nothing outside the module directory imports the module. Paste
  `grep -rn "sync-scroll" src test` and its output.
- The platform rule above, with its file and line numbers.
- The two gate measurements, with their numbers, labelled information only.
  Re-run each test once on this host on HEAD
  (`npm run test:e2e -- test/e2e/preview-perf.spec.ts` filtered to the two
  AC-PERF-09 and AC-PERF-11 20 MB tests if the runner supports a title filter;
  otherwise one full run of that file). Report the printed numbers once. Do not
  loop, do not repeat a passing row, and do not run a sample series on this host:
  the platform rule removes that requirement here.
- The CI facts above: run 42562841223 green on 4ff24c2; runs 42567255770 and
  42567341990 failed only on the Electron download 504. State that the new
  candidate re-runs CI on the enforcing runners.
- The budgets stay at 32 ms and 1 s. State that this note does not change them.
- The module's mutation evidence already exists: gate 1129 recorded four
  mutations (clamp at mapping.ts:72, first-anchor clamp at :58, last-anchor
  clamp at :61, the Math.round in sourceLineForPreviewTop), each reddening its
  named test; gate 1132 added the mapping.ts:58 revert. Cite them; add none.

## Done means

- The only changes are the merge commit (only if main moved) and the new
  evidence note.
- `npm run typecheck` exits 0.
- `npm run test:unit -- test/unit/syncScrollMapping.test.ts
  --coverage.enabled=false` passes 16 tests.
- `npm run check:acceptance` exits 0. AC-R3-01 and AC-R3-02 stay planned: the
  module stays unwired until the slice-9 wiring item.
- `npm run verify` exits 0, or exits 1 only from an informational AC-PERF row
  on this host. Paste its summary lines.
- Push the branch and report the CI run id for your candidate.
