# Fix: CI red on main at 7d19a21

Main's CI failed after merge 7d19a21: CI run 43295886602: failure.
Owner rule: a red main blocks every other merge, so this item runs first.

## Task
1. Reproduce the failure locally (the failing job and test are in the excerpt below; on a macOS-only failure, reason from the log and the platform branches in the code).
2. Find the root cause and fix it in the code or the test, whichever is wrong. State the cause in the commit message.
3. Do not widen a test budget, add a retry, skip a test or mark it flaky. If the test measures a real regression, fix the product code.
4. Run `npm run verify` and the failing spec.

## Allowed files
Any file the root cause needs; keep the change minimal.

## Failed log (last lines)
```
    Received:   83.30000000000291

      529 |     report("AC-PERF-02 preview-latency", samples);
      530 |     expect(samples).toHaveLength(SAMPLES);
    > 531 |     expect(percentile(samples, 0.95)).toBeLessThan(50);
          |                                       ^
      532 |   } finally {
      533 |     await closeEditor(application, page);
      534 |   }
        at ~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:531:39

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-02-50-b5d99-tency-p95-stays-under-50-ms/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/preview-perf-AC-PERF-02-50-b5d99-tency-p95-stays-under-50-ms/error-context.md

    Error Context: test-results/preview-perf-AC-PERF-02-50-b5d99-tency-p95-stays-under-50-ms/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-02-50-b5d99-tency-p95-stays-under-50-ms/trace.zip
    Usage:

        npx playwright show-trace test-results/preview-perf-AC-PERF-02-50-b5d99-tency-p95-stays-under-50-ms/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2) test/e2e/preview-perf.spec.ts:689:5 › AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms @AC-PERF-09 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   33.29999999999927,
    + ]

      680 |     `longtaskDurations=[${distribution(probe.longtasks)}]`,
      681 |   );
    > 682 |   expect(slowFrames).toEqual([]);
          |                      ^
      683 |   expect(probe.longtasks).toEqual([]);
      684 | }
      685 |
        at expectSmoothScroll (~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:682:22)
        at ~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:701:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-09-fl-26d91-iew-has-no-frame-over-32-ms/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/preview-perf-AC-PERF-09-fl-26d91-iew-has-no-frame-over-32-ms/error-context.md

    Error Context: test-results/preview-perf-AC-PERF-09-fl-26d91-iew-has-no-frame-over-32-ms/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-09-fl-26d91-iew-has-no-frame-over-32-ms/trace.zip
    Usage:

        npx playwright show-trace test-results/preview-perf-AC-PERF-09-fl-26d91-iew-has-no-frame-over-32-ms/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  3) test/e2e/preview-perf.spec.ts:707:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "true"
    Received: "false"

    Call Log:
    - Timeout 360000ms exceeded while waiting on the predicate

      717 |     await expect.poll(() => page.getByTestId("preview").evaluate(
      718 |       (element) => (element as HTMLElement).dataset["renderComplete"],
    > 719 |     ), { timeout: 360_000 }).toBe("true");
          |                              ^
      720 |     // Bounded fill batches need about 4.4 minutes for 114,567 blocks on this machine.
      721 |     console.log(`AC-PERF-09 20MB render complete after ${String(Date.now() - started)}ms`);
      722 |     await expectSmoothScroll(page, "AC-PERF-09 20MB scroll");
        at ~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:719:30

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms/error-context.md

    Error Context: test-results/preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms/trace.zip
    Usage:

        npx playwright show-trace test-results/preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  3 failed
    test/e2e/preview-perf.spec.ts:511:5 › AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms @AC-PERF-02 
    test/e2e/preview-perf.spec.ts:689:5 › AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms @AC-PERF-09 
    test/e2e/preview-perf.spec.ts:707:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 
  8 passed (7.5m)
##[error]Process completed with exit code 1.
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
with:
  name: perf-throttled-failure
  path: reports/
test-results/
playwright-report/

  if-no-files-found: ignore
  compression-level: 6
  overwrite: false

##[group]Run npm run build
[36;1mnpm run build[0m
shell: /bin/bash -e {0}
##[endgroup]

> solidmd@0.0.1 build
> tsc -p tsconfig.main.json && vite build

[36mvite v8.3.5 [32mbuilding client environment for production...[36m[39m
transforming...
✓ 91 modules transformed.
rendering chunks...
computing gzip size...
dist/renderer/index.html                           2.06 kB │ gzip:   0.78 kB
dist/renderer/assets/merge.worker-ByRZUb1L.js      6.58 kB
dist/renderer/assets/compare.worker-BgJzrtzE.js    7.37 kB
dist/renderer/assets/render.worker-C6XU0W84.js   308.71 kB
dist/renderer/assets/index-Czv7oFXM.css            7.34 kB │ gzip:   2.01 kB
dist/renderer/assets/index-DLca4BtT.js           708.40 kB │ gzip: 242.06 kB

[32m✓ built in 296ms[39m
[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
##[group]Run node scripts/run-e2e.cjs test/e2e/preview-perf.spec.ts test/e2e/io-worker.spec.ts
[36;1mnode scripts/run-e2e.cjs test/e2e/preview-perf.spec.ts test/e2e/io-worker.spec.ts[0m
shell: /bin/bash -e {0}
env:
  PLAYWRIGHT_JUNIT_OUTPUT_FILE: reports/perf-e2e-junit.xml
##[endgroup]
electron prewarm: 1542 ms

Running 11 tests using 1 worker

electron prewarm: 243 ms
argv title wait: 1313 ms (current.md)
  ✓   1 test/e2e/io-worker.spec.ts:34:5 › saving succeeds after the io-worker restarts @AC-R5-17 (8.3s)
argv title wait: 555 ms (current.md)
  ✓   2 test/e2e/io-worker.spec.ts:75:7 › a save in flight when the io-worker dies fails retryably and stays unsaved @AC-R5-17 (6.4s)
argv title wait: 633 ms (sample.md)
  ✘   3 test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 (3.2s)
electron prewarm: 338 ms
AC-PERF-10 open longtasks: n=0 max=0.0 ms blocks=2316
  ✓   4 test/e2e/preview-perf.spec.ts:360:5 › AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms @AC-PERF-10 (8.8s)
AC-PERF-02 macOS start: previous=5 survivors=0 load=33.64,41.73,20.23 cores=3 processes=[]
argv title wait: 235 ms (large-50kb.md)
AC-PERF-02 preview-latency: n=30 min=4.2 p50=15.4 p95=23.3 max=33.9 ms
AC-PERF-02 preview-latency distribution: 16.5, 9.8, 33.9, 22.5, 23.3, 14.2, 20.0, 18.5, 15.9, 12.2, 15.1, 4.2, 16.0, 6.3, 17.1, 4.4, 12.7, 16.8, 5.3, 18.3, 15.4, 18.4, 15.9, 16.1, 12.3, 10.5, 7.9, 12.6, 10.4, 16.7
  ✓   5 test/e2e/preview-perf.spec.ts:511:5 › AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms @AC-PERF-02 (4.5s)
argv title wait: 260 ms (large-500kb.md)
AC-PERF-07 preview-latency: n=30 min=3.9 p50=15.2 p95=30.2 max=34.9 ms
AC-PERF-07 preview-latency distribution: 16.4, 25.2, 3.9, 22.4, 4.3, 16.1, 18.4, 9.4, 13.7, 14.3, 22.2, 5.1, 30.2, 25.1, 7.1, 4.6, 27.2, 15.2, 15.6, 14.3, 17.7, 34.9, 5.1, 20.4, 8.9, 12.7, 4.4, 16.1, 16.7, 7.0
  ✓   6 test/e2e/preview-perf.spec.ts:537:5 › AC-PERF-07: 500 KB document keystroke latency p95 stays under 150 ms @AC-PERF-07 (4.0s)
argv title wait: 568 ms (large-20mb.md)
AC-PERF-10 preview-latency: n=30 min=6.5 p50=17.1 p95=34.1 max=48.1 ms
AC-PERF-10 preview-latency distribution: 34.1, 13.6, 24.8, 16.9, 14.0, 18.6, 8.3, 14.1, 16.3, 17.7, 25.1, 16.2, 17.1, 7.5, 20.9, 25.5, 48.1, 16.2, 21.4, 17.2, 6.7, 6.5, 21.2, 11.1, 19.9, 22.3, 7.3, 22.0, 22.2, 13.0
  ✓   7 test/e2e/preview-perf.spec.ts:554:5 › AC-PERF-10: 20 MB document keystroke latency p95 stays under 100 ms @AC-PERF-10 (4.9s)
argv title wait: 206 ms (large-500kb.md)
AC-PERF-08 preview-patch: n=30 min=0.4 p50=0.7 p95=1.6 max=2.0 ms
AC-PERF-08 preview-patch distribution: 0.4, 0.4, 0.6, 0.5, 0.6, 1.2, 0.6, 2.0, 1.6, 1.3, 1.6, 0.9, 0.7, 0.5, 1.1, 0.7, 0.5, 0.7, 0.7, 0.5, 0.5, 0.7, 0.5, 1.1, 0.6, 1.1, 0.9, 0.7, 1.2, 1.0
  ✓   8 test/e2e/preview-perf.spec.ts:571:5 › AC-PERF-08: one keystroke patches only the changed block under 8 ms p95 @AC-PERF-08 (10.5s)
  -   9 test/e2e/preview-perf.spec.ts:689:5 › AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms @AC-PERF-09
  -  10 test/e2e/preview-perf.spec.ts:707:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09
AC-PERF-11 20MB open: editable=294ms firstPreview=412ms
  ✓  11 test/e2e/preview-perf.spec.ts:728:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 (2.5s)


  1) test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 

    Error: expect(received).toBeLessThan(expected)

    Expected: < 2000
    Received:   2442.160333

      120 |     await expect(editor).toContainText("cold-start-ready");
      121 |
    > 122 |     expect(performance.now() - startedAt).toBeLessThan(2_000);
          |                                           ^
      123 |   } finally {
      124 |     await closeEditor(application, page);
      125 |   }
        at /Users/runner/work/solidmd/solidmd/test/e2e/io-worker.spec.ts:122:43

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/io-worker-an-argv-file-is--1d6ff-ithin-the-cold-start-budget/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/io-worker-an-argv-file-is--1d6ff-ithin-the-cold-start-budget/error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/io-worker-an-argv-file-is--1d6ff-ithin-the-cold-start-budget/trace.zip
    Usage:

        npx playwright show-trace test-results/io-worker-an-argv-file-is--1d6ff-ithin-the-cold-start-budget/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 
  2 skipped
  8 passed (58.1s)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1267 | 0 | 1267 |
| e2e-junit.xml | 0 | 0 | 0 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
