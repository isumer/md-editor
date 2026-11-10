# Fix: CI red on main at 6ed4338

Main's CI failed after merge 6ed4338: CI run 42461735009: failure.
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
  ✓  28 test/e2e/io-worker.spec.ts:108:5 › an argv file is editable within the cold-start budget @AC-PERF-03 (1.5s)
  ✓  29 test/e2e/ipc-contracts.spec.ts:107:7 › the file-save contract rejects a request without a version @AC-SEC-07 (2.5s)
  ✓  30 test/e2e/ipc-contracts.spec.ts:107:7 › the file-save contract rejects a request whose version is fractional @AC-SEC-07 (2.4s)
  ✓  31 test/e2e/ipc-contracts.spec.ts:107:7 › the file-save contract rejects a request whose grant is an object @AC-SEC-07 (2.8s)
  ✓  32 test/e2e/ipc-contracts.spec.ts:107:7 › the file-save contract rejects a request with an own __proto__ key @AC-SEC-07 (2.8s)
  ✓  33 test/e2e/ipc-contracts.spec.ts:107:7 › the file-save contract rejects an attach request with 257 MiB of text @AC-SEC-07 (4.4s)
  ✓  34 test/e2e/ipc-contracts.spec.ts:150:7 › the open-external contract rejects a file URL @AC-SEC-08 (2.2s)
  ✓  35 test/e2e/ipc-contracts.spec.ts:150:7 › the open-external contract rejects a javascript URL @AC-SEC-08 (1.8s)
  ✓  36 test/e2e/ipc-contracts.spec.ts:150:7 › the open-external contract rejects a data URL @AC-SEC-08 (6.1s)
  ✓  37 test/e2e/ipc-contracts.spec.ts:150:7 › the open-external contract rejects an unparsable URL @AC-SEC-08 (2.3s)
  ✓  38 test/e2e/ipc-contracts.spec.ts:150:7 › the open-external contract rejects a non-string URL @AC-SEC-08 (2.0s)
  ✓  39 test/e2e/ipc-contracts.spec.ts:188:5 › the preload exposes only the fixed named API @AC-SEC-11 (1.6s)
  ✓  40 test/e2e/ipc-contracts.spec.ts:230:5 › page scripts cannot open a path or create a trusted drop @AC-SEC-09 (1.8s)
  ✓  41 test/e2e/ipc-contracts.spec.ts:255:5 › the file-save contract rejects raw and forged grants @AC-SEC-09 (2.6s)
  ✓  42 test/e2e/ipc-contracts.spec.ts:292:5 › the file-save contract rejects a released grant @AC-SEC-09 (1.9s)
  ✓  43 test/e2e/open-failure-contracts.spec.ts:37:5 › opening a missing file names the failure and keeps the current document @AC-R5-13 @AC-R5-16 (1.9s)
  ✓  44 test/e2e/open-failure-contracts.spec.ts:53:5 › opening a directory names the failure and keeps the current document @AC-R5-13 @AC-R5-16 (2.3s)
  ✓  45 test/e2e/open-failure-contracts.spec.ts:69:7 › opening a file without read permission names the failure and keeps the document @AC-R5-13 @AC-R5-16 (2.2s)
AC-PERF-10 open longtasks: n=0 max=0.0 ms blocks=1692
  ✓  46 test/e2e/preview-perf.spec.ts:111:5 › AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms @AC-PERF-10 (10.0s)
AC-PERF-02 preview-latency: n=30 min=3.5 p50=16.0 p95=27.2 max=27.5 ms
AC-PERF-02 preview-latency distribution: 26.9, 27.2, 9.5, 13.8, 27.5, 23.0, 16.0, 7.0, 10.6, 12.6, 3.5, 15.7, 14.8, 16.0, 16.5, 13.3, 22.9, 18.2, 16.9, 14.7, 17.2, 19.8, 12.4, 14.3, 16.3, 20.7, 21.1, 12.4, 19.7, 20.7
  ✓  47 test/e2e/preview-perf.spec.ts:193:5 › AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms @AC-PERF-02 (5.4s)
AC-PERF-07 preview-latency: n=30 min=3.7 p50=16.8 p95=40.3 max=41.6 ms
AC-PERF-07 preview-latency distribution: 7.3, 16.9, 28.3, 11.2, 7.2, 12.1, 8.6, 23.8, 16.8, 4.7, 18.1, 23.1, 21.1, 10.9, 24.0, 19.9, 11.0, 13.2, 10.3, 34.1, 15.1, 22.9, 17.9, 17.6, 40.3, 37.5, 4.8, 3.7, 41.6, 15.0
  ✓  48 test/e2e/preview-perf.spec.ts:210:5 › AC-PERF-07: 500 KB document keystroke latency p95 stays under 150 ms @AC-PERF-07 (5.5s)
AC-PERF-10 preview-latency: n=30 min=3.7 p50=17.1 p95=35.8 max=40.8 ms
AC-PERF-10 preview-latency distribution: 5.5, 23.0, 6.0, 26.0, 12.3, 17.2, 5.1, 8.8, 33.0, 3.7, 6.5, 10.3, 24.0, 28.7, 27.9, 35.8, 17.8, 17.1, 7.7, 9.2, 27.4, 17.2, 18.6, 40.8, 24.4, 11.5, 18.0, 16.6, 9.1, 7.8
  ✓  49 test/e2e/preview-perf.spec.ts:227:5 › AC-PERF-10: 20 MB document keystroke latency p95 stays under 100 ms @AC-PERF-10 (7.7s)
AC-PERF-08 preview-patch: n=30 min=0.7 p50=0.9 p95=2.3 max=2.4 ms
AC-PERF-08 preview-patch distribution: 2.3, 0.9, 0.9, 1.2, 0.9, 0.7, 1.2, 1.5, 1.9, 0.9, 1.0, 1.6, 0.7, 0.8, 1.3, 0.8, 0.8, 0.9, 1.6, 0.7, 2.0, 0.8, 0.7, 0.7, 0.8, 1.7, 0.8, 0.7, 2.4, 0.7
  ✓  50 test/e2e/preview-perf.spec.ts:244:5 › AC-PERF-08: one keystroke patches only the changed block under 8 ms p95 @AC-PERF-08 (13.7s)
  -  51 test/e2e/preview-perf.spec.ts:362:5 › AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms @AC-PERF-09
  -  52 test/e2e/preview-perf.spec.ts:380:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09
AC-PERF-11 20MB open: editable=926ms firstPreview=1133ms
  ✘  53 test/e2e/preview-perf.spec.ts:401:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 (3.7s)
  ✓  54 test/e2e/preview.spec.ts:15:5 › typing in paragraph 3 keeps every other preview paragraph's DOM node @AC-R1-09 (2.4s)
  ✓  55 test/e2e/preview.spec.ts:64:5 › editing one block does not re-request another block's image @AC-R1-11 (2.2s)
  ✓  56 test/e2e/recovery.spec.ts:50:5 › quitting with dirty tabs prompts, and Save writes every document @AC-R4-06 (2.4s)
  ✓  57 test/e2e/recovery.spec.ts:79:5 › quitting with dirty tabs can discard without writing files @AC-R4-06 (3.0s)
  ✓  58 test/e2e/recovery.spec.ts:102:5 › a renderer crash recovers the last draft @AC-R4-07 (5.5s)
  ✓  59 test/e2e/recovery.spec.ts:144:5 › a crash recovers an untitled document from its draft @AC-R4-07 (5.5s)
  ✓  60 test/e2e/recovery.spec.ts:184:5 › discarding a dirty tab clears its draft so a crash does not restore it @AC-R4-05 (5.3s)
  ✓  61 test/e2e/recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (3.6s)
  ✓  62 test/e2e/recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (3.5s)
  ✓  63 test/e2e/save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (1.9s)
  ✓  64 test/e2e/save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (1.9s)
  ✓  65 test/e2e/save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (2.1s)
  ✓  66 test/e2e/save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (2.1s)
  ✓  67 test/e2e/save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (2.3s)
  ✓  68 test/e2e/save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (2.0s)
  ✓  69 test/e2e/save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (2.1s)
  ✓  70 test/e2e/save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (2.8s)
  ✓  71 test/e2e/save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (2.5s)
  ✓  72 test/e2e/save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (2.9s)
  ✓  73 test/e2e/save-contracts.spec.ts:339:7 › saving a read-only file names it and explains the permission failure @AC-R5-16 (3.2s)
  ✓  74 test/e2e/save-contracts.spec.ts:363:7 › a save failure stays visible when the preview renders the next edit @AC-R5-16 (3.3s)
  ✓  75 test/e2e/tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (7.2s)
  ✓  76 test/e2e/tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (2.8s)
  ✓  77 test/e2e/tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (19.9s)
  ✓  78 test/e2e/tabs.spec.ts:204:5 › opening a path that is already open focuses its tab without a duplicate @AC-R4-02 (2.6s)
  ✓  79 test/e2e/tabs.spec.ts:229:5 › Save As refuses a path that another open tab owns @AC-R4-02 (3.0s)
  ✓  80 test/e2e/tabs.spec.ts:260:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (2.2s)
  ✓  81 test/e2e/tabs.spec.ts:291:5 › closing a clean tab closes it with no prompt @AC-R4-04 (1.9s)
  ✓  82 test/e2e/tabs.spec.ts:316:5 › closing a dirty tab honours Cancel, Discard and Save @AC-R4-05 (2.3s)
  ✓  83 test/e2e/tabs.spec.ts:361:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (2.7s)


  1) test/e2e/preview-perf.spec.ts:401:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 

    Error: expect(received).toBeLessThan(expected)

    Expected: < 1000
    Received:   1133

      435 |     );
      436 |     expect(editableAfter).toBeLessThan(1_500);
    > 437 |     expect(previewAfter).toBeLessThan(1_000);
          |                          ^
      438 |   } finally {
      439 |     await closeEditor(application, page);
      440 |   }
        at /Users/runner/work/md-editor/md-editor/test/e2e/preview-perf.spec.ts:437:26

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-11-a--2bc09-ws-its-first-screen-in-time/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/preview-perf-AC-PERF-11-a--2bc09-ws-its-first-screen-in-time/error-context.md

    Error Context: test-results/preview-perf-AC-PERF-11-a--2bc09-ws-its-first-screen-in-time/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-11-a--2bc09-ws-its-first-screen-in-time/trace.zip
    Usage:

        npx playwright show-trace test-results/preview-perf-AC-PERF-11-a--2bc09-ws-its-first-screen-in-time/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    test/e2e/preview-perf.spec.ts:401:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 
  2 skipped
  80 passed (4.7m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 825 | 0 | 825 |
| e2e-junit.xml | 80 | 3 | 83 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
