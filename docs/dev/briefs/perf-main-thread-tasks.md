review: deep

# Perf: main-thread tasks over budget on main (macOS open, Windows fling)

Branch `bug/perf-main-thread-tasks` (from main). No new features, no new
dependencies. Follow AGENTS.md. Commit after each finding.

## Evidence (main CI, 2026-11-06)
1. macOS, main f79a071 (run 42286448354):
   `test/e2e/preview-perf.spec.ts:111` AC-PERF-10, opening a 20 MB
   document: one main-thread task of 101.0 ms (budget 100 ms,
   `blocks=2532`). Other macOS runs pass, so the task is close to the limit
   on every run.
2. Windows, main 3f46857 (run 42282066954): AC-PERF-09, fling-scrolling
   the 20 MB preview: one long task of 125 ms (budget: no frame over
   32 ms). Other Windows runs pass.

3. Real Mac (user, 2026-11-07, `--repeat-each 5`): AC-PERF-09 and -10
   all pass; open long tasks n=0, max 0 ms, ~10,000 blocks in the
   first preview (CI macOS: 2,532 blocks and one 101 ms task). The
   tasks appear only on slow shared runners, so reproduce them on
   Linux with CPU throttling (CDP `Emulation.setCPUThrottlingRate`,
   4x–6x) in a local probe, not in the committed test.

Both are product problems, not flakes: a task that sometimes crosses the
budget is a task that is too long. Read the logs with
`gh run view <run> --log-failed`.

## Goal
Find which work makes each task and split or move it so it stays well
below the budget on every platform. Likely places: the open path that
builds the first editor state and first preview for 20 MB, and the
preview fill/measure work that runs during a fling. Measure on Linux
with the same probe the tests use; show the largest task before and
after in the PR body.

## Rules
- Budgets (100 ms, 32 ms), the 360 s poll and the tests' assertions stay
  as they are. No skip, no retry, no platform exception.
- Allowed: the `src/` files on those two paths and their unit tests,
  plus `test/e2e/preview-perf.spec.ts` only to add measurements to the
  failure message. If the cause is outside them, stop and name the
  file and line in the report.

## Checks before you finish
`npm run typecheck`, unit, and `npx playwright test test/e2e/preview-perf.spec.ts`
green on Linux, with the largest open task and the largest fling task
printed. macOS and Windows are checked by CI after the push.
