review: deep

# Slice 4 fix 2 — 20 MB path, per-change cost, coverage, test seam

Work on branch `auto/039-slice-4-fix-review` (your fix-1 result plus the
review's test fixes). First run `git merge origin/main`. Read
`docs/dev/briefs/slice-4.md` and `slice-4-fix.md` again: their goals, tests
and budgets still hold. No new dependencies.

The last run ended at its turn limit. Commit after each finding below, in
this order, so a partial result is still reviewable.

## State of the branch (review of job 039)
Fixed by the review (keep them): typecheck in `deltaConsistency.test.ts`,
AC-R1-09 e2e selectors, a new AC-R1-04 `blockLine` test, delta test id.
Green: typecheck, unit (449), check:deps, AC-R1-10 equivalence (500 seeds).
Red: AC-PERF-09/10/11 on all 3 precheck repeats; check:coverage.

## Findings to fix (each needs a test that is red first)

1. **The window still freezes on a 20 MB file (blocker).** On the Pi
   precheck, clicking `.cm-content` times out after 30 s (AC-PERF-10), a
   `locator.evaluate` times out after 30 s (AC-PERF-09), and the first
   preview takes 3908 ms (AC-PERF-11, budget 1000 ms). This is a blocked
   main thread, not a near miss. Profile the renderer main thread from the
   open request to the first idle frame (Chrome trace through Playwright,
   or `performance.mark` spans). Name the top three costs in your report.
   Likely places: the CodeMirror load of 20 MB, text copies in attach,
   per-block sanitise on the main thread, and the fill pass's DOM appends.
   Every main-thread task after open must stay under 50 ms. The fill pass
   must apply its results in bounded batches and yield between them.
   Test: an e2e probe in `preview-perf.spec.ts` that records long tasks
   (`PerformanceObserver` type `longtask`) during open and asserts none
   over the AC-PERF-10 budget once the editor is shown. Red now.

2. **Per-change cost is O(all chunks) (major).** In
   `src/renderer/workers/render/incremental.ts`, `applyChange` shifts
   `startLine`/`endLine` of every following chunk on each line-count change,
   and `expectedBoundaries` walks every chunk on every change. The 20 MB
   fixture has one chunk per block. Make both proportional to the change:
   for example, store line numbers relative to a lazily applied offset, or
   find candidate boundaries by binary search near the change. Test: a
   counting unit test (AC-R1-10) on a 10,000-block document; one keystroke
   that adds a line touches at most a small constant number of chunk
   records. Red now.

3. **Time AC-PERF-11 from the open request.** `preview-perf.spec.ts:314`
   still starts the clock before `launchEditor`. Launch first, then open
   the file through the path a user takes, then time to the first preview.
   Add a one-line comment. Do not change any budget, timeout, sample count
   or threshold.

4. **Remove the test hook from `src/renderer/main.ts` (major).**
   `__mdEditorRenderWorkerFactory` is a global that only e2e sets. AGENTS.md
   forbids test-environment branches in `src`. Remove it. Prove AC-R1-06
   recovery with the existing unit tests, and in e2e with a real failure if
   one exists (for example a render that the worker rejects); otherwise
   delete that e2e test and say so in the report.

5. **Branch coverage ratchet is red (blocker).** `check:coverage`: branches
   96.98% against a 97.34% baseline. The new uncovered branches are in
   `incremental.ts` (10) and `chunks.ts` (3). Cover them with behaviour
   tests. Do not edit the baseline or the coverage config.

6. **Minor.** Delete `shiftDataLineAttributes` in `chunks.ts` (tests use it,
   production does not) or use it. Scope `anchorElement` in `preview.ts`
   to the preview root, not `document`. Restore `"\n"` to the random insert
   alphabet in the `renderWorker.test.ts` property test, or say in one line
   why it cannot hold.

## Allowed files
src/renderer/features/preview/**, src/renderer/workers/render/**,
src/renderer/main.ts, src/renderer/styles.css, src/shared/workers/render.ts,
test/unit/{preview,deltaConsistency,incrementalRender,previewEquivalence,
renderScheduler,renderWorker}*.test.ts, test/unit/<new>*.test.ts for these
modules, test/e2e/preview*.spec.ts. Nothing else.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per finding; the profile's top three costs before
and after; e2e distributions (p50/p95/max) for AC-PERF-02/07/08/09/10/11
on this machine. If a budget still misses after finding 1 is done, report
the numbers and stop: the reviewer decides. Name any e2e test you could
not run.
