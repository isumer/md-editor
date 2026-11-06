review: deep

# AC-PERF-09 on Ubuntu — find why the fling test is flaky

Base: main. Branch `bug/perf09-ubuntu-flake`. No new features, no new dependencies.
Follow AGENTS.md. This is an investigation first; a fix only if the cause is proven.

## Problem
AC-PERF-09 (fling-scroll the 500 KB and 20 MB preview, no frame over 32 ms,
no long task) passes 6/6 on Ubuntu when run alone. In the full e2e suite it
fails rarely: one frame near 100 ms, no long task recorded. A flaky test is
fixed or deleted, never retried into green. We need the cause.

## Evidence to start from
- CI run 42127724347 (ubuntu, full suite): one AC-PERF-09 frame over budget.
- Branch `bug/perf09-diag` (do not merge it) has a LoAF + Chromium
  contentTracing probe in `expectSmoothScroll` and GPU-info logging. Reuse
  the probe locally; do not land it as it is.
- On the macOS VM the slow frames were GPU-process waits with idle
  renderer. Check whether Ubuntu shows the same shape or a different one.

## Questions to answer, with data
1. Reproduce: run the full e2e suite (or the smallest ordered subset) until
   the failure appears. Record how often (N runs, failures).
2. Which spec(s) running before AC-PERF-09 make it fail? Bisect the order.
3. Where does the slow frame's time go: renderer main thread, compositor,
   GPU process, or nothing (scheduler/vsync gap)? Show trace slices.
4. Is it state left by earlier tests (open windows, workers, timers,
   20 MB fill still running, GC of a previous app), machine load from the
   other lane, or the product?

## Rules
- Do not raise the 32 ms budget, add retries, or skip the test.
- If earlier tests leak state (an app not closed, a worker still running),
  fix the leak in the test or the product, red first.
- If the cause is in the product, fix it with a failing test first.
- If the cause is outside our control (runner/xvfb scheduling), stop and
  write the numbers; the owner decides.

## Deliverable
`docs/dev/notes/perf09-ubuntu-flake.md`: method, run counts, trace
findings, the cause or the ranked candidates, and the proposed fix.
Allowed files: that note, `test/e2e/**`, and `src/**` only for a proven fix.
