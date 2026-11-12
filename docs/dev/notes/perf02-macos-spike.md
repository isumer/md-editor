# AC-PERF-02 macOS spike investigation

Date: 2026-11-12.

## Result

The diagnostic now captures the live render worker.
It patches `Worker.prototype.postMessage` after the first window exists.
The patch wraps the existing worker handler on its next render request.

Each measured keystroke must capture its render request and matching response.
Apply intervals are captured synchronously because the application clears those
marks before a `PerformanceObserver` can read them. Measures and task entries
are collected by the observer, off the measured call path.
Later fill marks cannot replace the interval inside a measurement.

Probe installation errors now fail the test.
Missing requests, responses, measures, or apply intervals also fail the test.
The diagnostic does not classify missing data as unattributed time.

The 50 ms budget stays unchanged.
The test keeps 30 samples and five warm-up keystrokes.
No retry, skip, or platform exemption exists.

## Named diagnostic defects

The previous probe replaced `window.Worker` after module initialization.
`RenderController` had already created its worker.
Therefore, the probe could miss every measured request and response.

The previous report waited for another animation frame.
It then read the latest global apply marks.
Deferred fill work could replace the measured keystroke's marks.

The corrected probe associates requests, responses, and apply intervals by the
measured time range. It does not wrap `performance.measure`.

## macOS evidence

The candidate branch has four push runs.
This count reaches the brief's four-run limit.

- Run 43150275798 used candidate 13719b4. Its macOS job passed.
- Run 43242568507 used candidate 2eb5831. Its macOS performance step failed.
- Run 43251073427 used candidate 9e426ae. Its macOS performance step failed.
- Run 43261075704 used candidate 395f0b7. Its macOS job passed.

Automated gate-fix run 43286531323 started after the four-run investigation.
It used corrected candidate a8dd5e2.
Its macOS performance step passed.
Its Ubuntu and Windows performance steps failed.
Public metadata does not identify the failed tests.

Run 43297370298 used candidate 09467d9.
Its Ubuntu, Windows, and macOS jobs passed.
Each job passed its performance step with the unchanged budgets.
The throttled information-only job failed and did not block the run.
This run settles the three-OS gate failure from run 43286531323.

The public API exposes these job and step results.
It does not expose their logs without repository administration rights.
The failure artifacts also require authentication.

Candidate 395f0b7 had the two diagnostic defects above.
Its zero-valued attribution cannot name the macOS spike cause.
The corrected probe ran on macOS after AC-PERF-10.
Its logs remain inaccessible without repository administration rights.

This checkout cannot start another macOS run.
The Git remote uses SSH, but this environment has no SSH client.
Therefore, the macOS product cause remains unproven.
Do not infer an application or runner cause from missing probe data.

## Process evidence

`reportMacProcessLoad` reports the previous application tree on macOS.
It also reports surviving processes and the system load average.
It stays quiet on other platforms.

The existing runs did not provide accessible process logs.
The corrected candidate still needs an AC-PERF-02-only comparison.
That comparison requires an authenticated macOS CI run.

The public job data cannot name the earlier Ubuntu and Windows failures.
Run 43297370298 passed both jobs after candidate 09467d9 merged current main.
No task-owned change exists between the two runs that explains those failures.

## Test proof

Three non-performance end-to-end tests guard the diagnostic.

- A missing installation produces a diagnostic failure.
- Removing live worker capture loses the request or response and fails.
- Later fill marks cannot replace the stored apply interval.

The first focused run exposed an incomplete apply interval.
The scheduler publishes the latency measure inside `applyResult`, before
`preview-apply-end` is marked immediately after `applyResult` returns.
The probe now selects the apply interval containing the measure's end instead
of requiring that interval to have already ended.
Both affected tests passed after this correction.

The Ubuntu verify exposed an observation race after the preview DOM updated.
The matching latency measure is published at the end of the render callback.
The diagnostic now polls for that completed record without sleeps, retries,
or relaxed assertions.

A second Ubuntu reproduction exposed queued warm-up observer records arriving
after the measurement probe was reset. Reset now drains pending observer records
before clearing the probe arrays, so old measures cannot lose their apply data
or be counted among the 30 samples.

The first correction also read probe state after every measured keystroke.
Those renderer round-trips changed the cadence under measurement and allowed
background work to interleave differently. The probe now records in-page for
the full sample window, then validates and reports all 30 records together.

## Gate failure evidence

Job 1573 ran the three untagged diagnostic tests.
Its e2e report contained no tagged performance tests.
The acceptance check then reported the absent performance criteria as missing.
The report showed dashes for AC-PERF-02, AC-PERF-03, AC-PERF-07, and AC-PERF-08.
A failed tagged test would appear as a named, non-passing test instead.

The targeted local command must exclude `@AC-PERF` tests on this host.
Therefore, its report must not feed the acceptance check.
CI runs the performance split and merges its report before the acceptance check.
No product or diagnostic failure caused this gate result.

## Size exceptions

`test/e2e/preview-perf.spec.ts` has 930 lines.
The task permits changes only to the existing task-owned files.
Splitting the probe would add an unapproved file.

`installKeystrokeProbe` exceeds 50 lines.
`page.evaluate` serializes one closed browser function.
The one-line source comment records this constraint.

## Validation

- `npm run typecheck` passed.
- `npm run check:deps` passed for 162 modules and 360 dependencies.
- `npm run test:unit` passed 1,267 tests in 122 files.
- `npm run check:coverage` passed every ratchet.
- Statements measured 99.05 percent.
- Branches measured 97.30 percent.
- Functions measured 99.15 percent.
- Lines measured 99.24 percent.
- `npm run build` passed.
- The three focused non-AC-PERF diagnostic tests passed after the correction.
- The owner-required non-AC-PERF e2e run passed all three diagnostic tests.
- The focused AC-PERF-02 run captured and validated all 30 diagnostic records.
- `npm run verify` passed typecheck, dependency checks, all 1,267 unit tests,
  the build, and 105 of 108 end-to-end tests.
- Its end-to-end run captured all 30 AC-PERF-02 diagnostic records, then measured
  p95 at 79.9 ms on this host and correctly failed the unchanged 50 ms budget.
- This host also missed the existing AC-PERF-09 and AC-PERF-11 budgets.
- A focused AC-PERF-02 run measured p95 at 68.6 ms on this host.
