review: deep

# Windows argv-open perf gate: close the three 20 MB findings

Base: continues the PR branch `feature/windows-argv-open-flake` at
`6e0ddee`. Run `git merge origin/main` first. Keep the goals of
`windows-argv-open-flake.md` and `windows-argv-open-flake-fix.md`. Add no
features. No new dependencies. Commit after each item.

The Vision gate on candidate `6e0ddee` failed `npm run verify` on three
20 MB performance tests. CI on `6e0ddee` is green on ubuntu, windows and
macOS (run 42532450205). The Pi rows are information only (standing
note). This brief names every gate finding and says how each one is
closed.

## Findings

1. Blocker - `test/e2e/preview-perf.spec.ts:116`, AC-PERF-10 "opening a
   20 MB document keeps every main-thread task under 100 ms". One task
   exceeded 100 ms on the Pi.
2. Blocker - `test/e2e/preview-perf.spec.ts:385`, AC-PERF-09
   "fling-scrolling the 20 MB preview has no frame over 32 ms". The 20 MB
   preview did not finish within the 360,000 ms poll.
3. Blocker - `test/e2e/preview-perf.spec.ts:406`, AC-PERF-11 "a 20 MB
   document is editable and shows its first screen in time". The first
   screen took 1,208 ms against the 1,000 ms limit.

This branch changes three e2e files only. It does not change the
production preview or render path. AC-PERF-10 and AC-PERF-11 launch with
no file path, so the new argv wait does not run for them. AC-PERF-09
launches with a path, but the new wait only polls `document.title`.

The production cause of the three rows is owned by
`perf-open-long-task-6` (job 1068, brief `perf-open-long-task-6.md`,
allowed files `src/renderer/features/preview/**` and
`src/renderer/workers/render/**`). Do not edit those files here.

## Allowed files
`test/e2e/helpers.ts`, `test/e2e/editor.spec.ts`,
`test/e2e/preview.spec.ts`. Nothing else. Do not edit
`test/e2e/preview-perf.spec.ts`, `playwright.config.ts`,
`docs/acceptance/**`, `CHANGELOG.md`, the workflows or `package.json`.

## Items

1. **Merge main and check the owner.** Run `git merge origin/main`.
   Confirm that the `perf-open-long-task-6` work is on main:
   `grep -n "clearMarks" src/renderer/features/preview/preview.ts` finds
   the bounded marks. If that work is not on main, stop and report. Do not
   fix it here.

2. **Measure once.** On the merged tree, run the three findings once:
   `npx playwright test test/e2e/preview-perf.spec.ts -g
   "AC-PERF-09|AC-PERF-10|AC-PERF-11"`, through `locked-npm`. Record each
   measured value and each failure. Do not loop on these tests, and do not
   tune code or budgets to the Pi.

3. **Prove the branch is stable.** Run the two new failure tests and the
   moved preview listener test ten times: `--repeat-each 10`. They must
   pass every time. Record the run.

4. **Fix only a real branch defect.** If item 2 fails on the merged tree
   in a way that the three allowed files can cause, fix it there and show
   a red test first. If the cause is in the preview or render path, stop
   and report the trace. Never change a budget, wait, timeout, retry or
   skip. No `Protected-change` is allowed.

5. **Prove it on CI.** Push the candidate to
   `feature/windows-argv-open-flake`. `Test (ubuntu-latest)`,
   `Test (windows-latest)` and `Test (macos-latest)` must be green. Paste
   the run and job ids in the report.

## Rules
- Keep `ARGV_TITLE_TIMEOUT_MS = 10_000`, the poll predicate and the macOS
  chord constants (`PRIMARY_MODIFIER`, `DOCUMENT_START`, `DOCUMENT_END`).
- Keep the 100 ms task budget, the 32 ms frame budget, the 1,000 ms
  first-screen budget, the 5 s window, the 360 s poll and every
  assertion. No skip, retry, platform exception or threshold change.
- Plain ASCII. LF endings. Comments one or two lines.
