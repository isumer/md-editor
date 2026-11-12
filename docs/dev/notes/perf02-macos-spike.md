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

The public API exposes these job and step results.
It does not expose their logs without repository administration rights.
The failure artifacts also require authentication.

Candidate 395f0b7 had the two diagnostic defects above.
Its zero-valued attribution cannot name the macOS spike cause.
The corrected probe has not run on macOS.

This checkout cannot start another macOS run.
The Git remote uses SSH, but this environment has no SSH client.
Therefore, the macOS product cause remains unproven.
Do not infer an application or runner cause from missing probe data.

## Process evidence

`reportMacProcessLoad` reports the previous application tree on macOS.
It also reports surviving processes and the system load average.
It stays quiet on other platforms.

The existing four runs did not provide accessible process logs.
The corrected candidate must compare AC-PERF-02 alone and after AC-PERF-10.
That comparison requires an authenticated macOS CI run.

## Test proof

Three non-performance end-to-end tests guard the diagnostic.

- A missing installation produces a diagnostic failure.
- Removing live worker capture loses the request or response and fails.
- Later fill marks cannot replace the stored apply interval.

The first focused run exposed an incomplete apply interval.
A later fill start occurred before the latency measure recorded.
The probe now keeps completed intervals separately.
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

## Size exceptions

`test/e2e/preview-perf.spec.ts` has 940 lines.
The task permits changes only to the existing task-owned files.
Splitting the probe would add an unapproved file.

`installKeystrokeProbe` exceeds 50 lines.
`page.evaluate` serializes one closed browser function.
The one-line source comment records this constraint.

## Validation

- `npm run typecheck` passed.
- `npm run check:deps` passed for 162 modules and 360 dependencies.
- `npm run test:unit` passed 1,265 tests in 122 files.
- `npm run check:coverage` passed every ratchet.
- Statements measured 99.05 percent.
- Branches measured 97.30 percent.
- Functions measured 99.15 percent.
- Lines measured 99.24 percent.
- `npm run build` passed.
- The three focused non-AC-PERF diagnostic tests passed after the correction.
- The focused AC-PERF-02 run captured and validated all 30 diagnostic records.
- `npm run verify` passed typecheck, dependency checks, and all 1,265 unit tests.
- Its end-to-end run captured all 30 AC-PERF-02 diagnostic records, then measured
  p95 at 66.6 ms on this host and correctly failed the unchanged 50 ms budget.
- A focused AC-PERF-02 run measured p95 at 83.7 ms on this host.
