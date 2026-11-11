# AC-PERF-09 Ubuntu flake investigation

Date: 2026-11-11.

## Result

The available data does not prove one cause for both failures.

The 33.3 ms failure most likely came from renderer lifecycle work crossing a vsync boundary.

The older near-100 ms failure can still be an external scheduling gap.

No product or test fix is safe without a traced failure.

## Method

I inspected the retained Ubuntu artifacts from runs 42127724347 and 42875705947.

I also inspected Ubuntu trace artifacts from diagnostic runs 42166155489, 42173729322, and 42204967041.

The diagnostic branch ran each AC-PERF-09 case three times per run.

I queried the Chromium traces with Trace Processor v59.1.

I limited trace analysis to the first 1,050 ms around each fling.

I did not run the full suite locally.

The owner instruction permits only affected non-performance specs locally.

This change affects no e2e spec.

## Reproduction counts

The brief records six isolated passes.

The three diagnostic runs add nine 500 KB passes and nine 20 MB passes.

The isolated and diagnostic total is 15 case executions for each size.

Run 42875705947 failed once during one full-suite run.

Its 500 KB case passed with 111 frames and a 16.8 ms maximum.

Its 20 MB case failed with 110 frames and one 33.3 ms frame.

That failure recorded no Long Task API entry.

Run 42127724347 had one near-100 ms frame and no long task.

Runs 42851180448 and 42881220898 passed with 16.8 ms 20 MB maxima.

These four named full-suite runs contain two failures.

This rate is selected evidence and is not an unbiased failure estimate.

## Order findings

The nine diagnostic 20 MB cases passed without earlier spec files.

Run 42875705947 failed after all earlier files and five earlier performance cases.

The immediately earlier case was the passing 500 KB fling.

The other earlier performance cases also passed.

No individual predecessor is isolated by the available runs.

The latest owner instruction prevented a local ordered-subset bisection.

Only the full-suite environment or order remains associated with the failures.

## Trace findings

Ubuntu used software compositing in every diagnostic run.

Chromium reported GPU access disabled after frequent crashes.

All nine traced 20 MB cases reported a 16.8 ms JavaScript frame maximum.

All nine cases reported zero long tasks.

Eight traces contained usable renderer, compositor, and GPU slices.

Their maximum renderer-main tasks ranged from 7.635 ms through 22.862 ms.

Their maximum renderer-compositor tasks ranged from 0.760 ms through 2.497 ms.

Their maximum GPU-process tasks ranged from 1.647 ms through 5.012 ms.

Recorded RAF jank reached 41.179 ms in run 42173729322.

That slice started 989.530 ms after tracing began.

The renderer main task used 22.862 ms.

Style and layout used 13.565 ms.

Paint used 5.853 ms.

The renderer compositor used at most 0.996 ms around commit.

The GPU process used 2.003 ms for display draw and swap.

The slice therefore differs from the macOS GPU-wait shape.

Renderer lifecycle work dominated this Ubuntu slice.

The JavaScript probe did not report this traced jank.

The jank began at the fling boundary, so probe shutdown can hide the final pipeline frame.

The failing full-suite artifact contains only a Playwright protocol trace.

It does not contain Chromium thread slices for the 33.3 ms frame.

Therefore, the traced green slice supports a candidate cause but does not prove failure attribution.

## State and load

Each launch used a unique profile in run 42875705947.

Each earlier test awaited application closure and process exit.

No retained artifact shows an extra window, worker, or Electron process.

The 20 MB fill reported completion before every fling.

These facts reduce the probability of leaked application state.

They do not exclude operating-system load or a concurrent pipeline lane.

The artifacts contain no host scheduler trace or concurrent-lane utilization data.

## Ranked candidates

1. Renderer style, layout, and paint crossed a software-compositor vsync boundary.
2. The host scheduler or xvfb withheld the renderer near a vsync boundary.
3. Earlier tests changed cache or memory pressure without leaving a live process.
4. An application process or worker leaked from an earlier test.

Candidate one best explains the 33.3 ms frame and the diagnostic 41.179 ms RAF jank.

Candidate two best explains the older near-100 ms gap without a long task.

The current evidence does not distinguish these candidates for both failures.

## Proposed next step

Start Chromium content tracing before each fling and retain it only when the JavaScript probe observes a frame above 32 ms.

The trace must include renderer, compositor, GPU, scheduler, and host scheduling events.

The run must preserve the full-suite order and record concurrent runner load.

Do not raise the budget, retry the test, or skip it.

If a failure shows renderer lifecycle work, add a failing regression test before a product fix.

If a failure shows idle renderer threads, report runner or xvfb scheduling to the owner.

## Validation

`npm run typecheck` passed.

`npm run check:deps` passed with 147 modules and 312 dependencies.

`npm run test:unit` passed 1,140 tests in 111 files.

Statement coverage was 99.05 percent.

Branch coverage was 97.29 percent.

Function coverage was 99.21 percent.

Line coverage was 99.20 percent.

`npm run check:coverage` passed every ratchet.

The ten e2e criteria needed to complete the partial JUnit report passed.

AC-PERF-02 measured 30.0 ms p95 against 50 ms.

AC-PERF-07 measured 46.2 ms p95 against 150 ms.

AC-PERF-08 measured 1.8 ms p95 against 8 ms.

`npm run check:acceptance` passed after those results replaced the partial report.
