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
- CI run 42875705947 (ubuntu, candidate 13cb57c, a fixture-only diff that
  cannot change frame times): 20 MB fling has one 33.3 ms frame, no long
  task; the 500 KB row in the same run is green (16.8 ms). Main runs just
  before and after are green with 20 MB maxFrame 16.8 ms (42851180448,
  42881220898).
- Branch `bug/perf09-diag` (do not merge it) has a LoAF + Chromium
  contentTracing probe in `expectSmoothScroll` and GPU-info logging. Reuse
  the probe locally; do not land it as it is.
- On the macOS VM the slow frames were GPU-process waits with idle
  renderer. Check whether Ubuntu shows the same shape or a different one.

## Owner and budget
- Owner: Vision. The Friday research lane ran one session on 2026-11-06
  and produced no data; this job supersedes it.
- The 20 MB tests wait up to 4.4 minutes each for the fill. Cap
  reproduction at about 30 minutes: use the smallest ordered subset that
  shows the failure, not N full-suite runs. Proceed with the traces you
  have when the cap is hit and say so in the note.

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
Allowed files: that note, `test/e2e/**` except `test/e2e/preview-perf.spec.ts`
(owned by the queued perf-macos-diagnosis item; work in a copy such as
`test/e2e/diag-preview-perf.spec.ts`), and `src/**` only for a proven fix.
