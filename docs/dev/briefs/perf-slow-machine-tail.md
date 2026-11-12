# Perf on a slow machine: cut the tail, keep the budgets

Owner decision (2026-11-12): macOS stops failing, the perf criteria stay blocking,
and no budget, sample count, retry or skip changes. The app gets faster where a
slow machine shows it is slow.

## Evidence (fresh macos-latest runners, same commit)

Run 43253970547 (five runners) and 43253195712 (three runners):

| criterion | budget | fast runner | slow runner |
|---|---|---|---|
| AC-PERF-11 20 MB open, first preview | < 1000 ms | 335 ms | 1369–1602 ms |
| AC-PERF-02 50 KB keystroke p95 | < 50 ms | 23.8 ms | 55.8–71.5 ms |
| AC-PERF-10 20 MB open, longest main-thread task | < 100 ms | 0 tasks | 243 ms at preview-apply |
| AC-PERF-03 cold start | < 2000 ms | 977 ms | 1852–2231 ms |

Ubuntu also shows a tail on AC-PERF-09 20 MB scroll: one frame at 33.3 ms, and
the test runs 4+ min (runs 43236411820 and 43253962260; main ran it at about
16.8 ms max).

A slow runner is 3–7× slower on the same work. The fix is to remove main-thread
and critical-path work, so 3–7× of what remains still fits the budget.

## Method (every slice)

1. Measure first. Record a per-phase timeline on CI (performance marks plus
   long-animation-frame (LoAF) script attribution) for the slow path, and put the
   numbers in the PR body before any change.
2. Remove the work, then reduce it, then make it faster (in that order). Name
   where each moved cost went.
3. Target: the phase you change must cost at most a third of its budget on a fast
   runner, so a 3× slower machine still passes.
4. No budget, sample, warm-up, retry or skip change. No test edit that weakens
   what it measures.

## Done when
Jarvis's five-runner macOS check (diag workflow) is green with the slice's
criterion on every runner, and the normal CI is green on all three OS.
