# Fix: CI red on main at 45c0d8f

Main's CI failed after merge 45c0d8f: CI run 43276463700: failure.
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
    + Received  + 7

    - Array []
    + Array [
    +   33.29999999999927,
    +   33.29999999999927,
    +   33.5,
    +   33.29999999999927,
    +   33.30000000000109,
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
dist/renderer/assets/index-D7XImQ8W.js           708.24 kB │ gzip: 242.02 kB

[32m✓ built in 285ms[39m
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
electron prewarm: 1352 ms

Running 11 tests using 1 worker

electron prewarm: 271 ms
argv title wait: 999 ms (current.md)
  ✓   1 test/e2e/io-worker.spec.ts:34:5 › saving succeeds after the io-worker restarts @AC-R5-17 (5.1s)
argv title wait: 234 ms (current.md)
  ✓   2 test/e2e/io-worker.spec.ts:75:7 › a save in flight when the io-worker dies fails retryably and stays unsaved @AC-R5-17 (4.0s)
argv title wait: 505 ms (sample.md)
  ✘   3 test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 (4.2s)
electron prewarm: 218 ms
AC-PERF-10 open longtasks: n=0 max=0.0 ms blocks=2068
  ✓   4 test/e2e/preview-perf.spec.ts:360:5 › AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms @AC-PERF-10 (8.8s)
AC-PERF-02 macOS start: previous=5 survivors=0 load=27.95,31.40,14.76 cores=3 processes=[]
argv title wait: 220 ms (large-50kb.md)
AC-PERF-02 preview-latency: n=30 min=4.5 p50=13.4 p95=24.3 max=45.9 ms
AC-PERF-02 preview-latency distribution: 45.9, 10.7, 13.4, 14.6, 15.4, 12.3, 20.1, 7.5, 16.6, 6.5, 12.7, 10.3, 11.1, 11.5, 17.8, 5.1, 13.4, 24.3, 9.7, 12.6, 16.2, 15.7, 10.6, 5.2, 17.9, 15.6, 14.9, 16.9, 4.5, 16.4
  ✓   5 test/e2e/preview-perf.spec.ts:511:5 › AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms @AC-PERF-02 (4.3s)
argv title wait: 229 ms (large-500kb.md)
AC-PERF-07 preview-latency: n=30 min=3.5 p50=17.3 p95=23.3 max=43.4 ms
AC-PERF-07 preview-latency distribution: 17.3, 22.8, 5.2, 5.1, 18.4, 21.1, 10.9, 22.0, 17.9, 18.4, 19.0, 23.1, 23.3, 10.7, 10.4, 3.5, 18.3, 11.2, 18.0, 20.8, 21.6, 8.2, 16.7, 14.3, 4.3, 7.8, 8.9, 4.4, 20.1, 43.4
  ✓   6 test/e2e/preview-perf.spec.ts:537:5 › AC-PERF-07: 500 KB document keystroke latency p95 stays under 150 ms @AC-PERF-07 (4.0s)
argv title wait: 326 ms (large-20mb.md)
AC-PERF-10 preview-latency: n=30 min=5.1 p50=18.0 p95=32.2 max=50.9 ms
AC-PERF-10 preview-latency distribution: 18.1, 12.0, 32.2, 12.9, 18.3, 22.0, 13.1, 16.8, 5.1, 15.1, 20.2, 19.3, 13.6, 9.3, 21.3, 14.0, 25.3, 22.3, 18.0, 5.7, 12.3, 23.0, 14.4, 24.8, 22.1, 19.2, 12.7, 50.9, 19.6, 8.1
  ✓   7 test/e2e/preview-perf.spec.ts:554:5 › AC-PERF-10: 20 MB document keystroke latency p95 stays under 100 ms @AC-PERF-10 (4.7s)
argv title wait: 249 ms (large-500kb.md)
AC-PERF-08 preview-patch: n=30 min=0.3 p50=0.6 p95=1.3 max=1.4 ms
AC-PERF-08 preview-patch distribution: 0.4, 0.7, 0.8, 1.0, 0.5, 0.4, 1.4, 1.0, 0.5, 0.4, 0.5, 1.3, 1.1, 0.8, 0.5, 1.1, 0.8, 0.4, 0.6, 0.6, 0.9, 0.6, 1.0, 0.5, 0.4, 0.5, 1.0, 0.9, 0.9, 0.3
  ✓   8 test/e2e/preview-perf.spec.ts:571:5 › AC-PERF-08: one keystroke patches only the changed block under 8 ms p95 @AC-PERF-08 (9.4s)
  -   9 test/e2e/preview-perf.spec.ts:689:5 › AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms @AC-PERF-09
  -  10 test/e2e/preview-perf.spec.ts:707:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09
AC-PERF-11 20MB open: editable=293ms firstPreview=547ms
  ✓  11 test/e2e/preview-perf.spec.ts:728:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 (2.6s)


  1) test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 

    Error: expect(received).toBeLessThan(expected)

    Expected: < 2000
    Received:   2477.4680000000008

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
  8 passed (52.0s)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1265 | 0 | 1265 |
| e2e-junit.xml | 0 | 0 | 0 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
