# Slice 9 fix 4 performance verification

## Same-machine comparison

The host is a Raspberry Pi. Its performance results are information only.

| Criterion | Revision | Result |
|---|---|---|
| AC-PERF-02 | `origin/main` at `c5d928e` | n=30, min=7.4, p50=16.7, p95=38.7, max=45.5 ms |
| AC-PERF-02 | candidate | n=30, min=7.1, p50=19.7, p95=29.9, max=40.8 ms |
| AC-PERF-11 | `origin/main` at `c5d928e` | editable=620 ms, first preview=888 ms |
| AC-PERF-11 | candidate | editable=624 ms, first preview=883 ms |

The candidate did not regress AC-PERF-02. The distributions overlap.

The `origin/main` AC-PERF-02 distribution was:

`45.5, 28.8, 10.2, 11.6, 38.7, 8.0, 8.1, 10.8, 7.7, 22.1, 7.8, 27.9, 9.6, 15.8, 21.5, 7.4, 18.4, 10.1, 20.9, 8.0, 14.1, 19.0, 16.7, 21.8, 16.6, 17.0, 19.7, 21.7, 20.9, 24.0`.

The candidate AC-PERF-02 distribution was:

`17.4, 23.6, 29.9, 26.3, 22.8, 40.8, 16.5, 9.5, 7.8, 9.3, 22.6, 19.7, 10.8, 20.7, 22.6, 7.1, 21.3, 15.3, 25.4, 21.3, 16.8, 12.1, 20.3, 16.3, 19.2, 21.4, 22.7, 20.0, 15.8, 18.4`.

The final verification AC-PERF-02 result had n=30 and p95=35.1 ms.

Its minimum was 7.7 ms. Its p50 was 18.2 ms. Its maximum was 53.7 ms.

The final distribution was:

`31.0, 19.7, 25.4, 35.1, 22.9, 53.7, 21.5, 8.3, 23.9, 9.5, 20.8, 16.6, 15.8, 16.6, 8.8, 8.3, 8.4, 8.2, 20.1, 22.2, 22.9, 20.3, 10.6, 22.1, 7.7, 19.4, 18.2, 8.4, 8.6, 8.6`.

The final verification AC-PERF-11 result was editable=640 ms and first preview=951 ms.

## Scroll performance

The candidate AC-PERF-09 500 KB run measured 113 frames.

Its maximum frame was 50.0 ms. Three frames exceeded 32 ms.

The slow frames were 33.4, 50.0, and 33.2 ms.

One 58.0 ms long task occurred.

The final 500 KB run measured 110 frames and a 33.4 ms maximum.

Four final-run frames exceeded 32 ms. The final run recorded no long task.

The candidate AC-PERF-09 20 MB fill did not finish within 360 seconds.

The run did not measure its scroll frames.

AC-R3-05 did not reach render completion within 300 seconds.

Desktop CI must prove both AC-PERF-09 rows. No desktop result is available locally.

## Red evidence

The cache test failed with seven layout reads inside the scroll callback.

The test passed after scroll processing stopped refreshing geometry.

The delayed feedback test failed with one reverse editor update.

The test passed after guards used numeric targets instead of one animation frame.

The focus completion test stayed blocked when the exit promise did not settle.

The test passed after the completion listener attached before the exit request.

The trailing resize test detected a changed preview block before anchor restoration.

The desktop frame-budget mutation requires desktop CI. This Pi already exceeds the budget.

## Acceptance state

AC-R2-04, AC-R2-05, and AC-R3-03 changed from `implemented` to `planned`.

They must return to `implemented` only after their desktop CI rows pass.

## Final checks

Full verification passed 103 end-to-end tests.

It failed three information-only Pi performance rows and AC-R2-05.

AC-R2-05 ended at block 1083. It started at block 1084.

The full unit suite passed 1,149 tests after the final coverage additions.

The coverage ratchet passed all four metrics.

Type checking passed after the final test edits.

`viewsController.test.ts` exceeds 400 lines because its scenarios share one DOM fixture.

