# Fix: CI red on main at 8d77dba

Main's CI failed after merge 8d77dba: CI run 42929395237: failure.
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
  ✓  66 test/e2e/recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (3.6s)
argv title wait: 446 ms (sample.md)
  ✓  67 test/e2e/recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (3.8s)
argv title wait: 407 ms (original.md)
  ✓  68 test/e2e/save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (2.2s)
  ✓  69 test/e2e/save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (1.8s)
argv title wait: 225 ms (current.md)
  ✓  70 test/e2e/save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (2.3s)
argv title wait: 470 ms (current.md)
  ✓  71 test/e2e/save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (2.6s)
argv title wait: 426 ms (current.md)
  ✓  72 test/e2e/save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (2.3s)
argv title wait: 208 ms (current.md)
  ✓  73 test/e2e/save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (1.8s)
argv title wait: 389 ms (sample.md)
  ✓  74 test/e2e/save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (1.8s)
argv title wait: 430 ms (current.md)
  ✓  75 test/e2e/save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (1.7s)
argv title wait: 216 ms (sample.md)
  ✓  76 test/e2e/save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (1.5s)
argv title wait: 468 ms (current.md)
  ✓  77 test/e2e/save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (1.9s)
argv title wait: 176 ms (read-only.md)
  ✓  78 test/e2e/save-contracts.spec.ts:339:7 › saving a read-only file names it and explains the permission failure @AC-R5-16 (2.0s)
argv title wait: 415 ms (read-only.md)
  ✓  79 test/e2e/save-contracts.spec.ts:363:7 › a save failure stays visible when the preview renders the next edit @AC-R5-16 (1.9s)
argv title wait: 193 ms (alpha.md)
  ✓  80 test/e2e/tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (2.3s)
argv title wait: 398 ms (alpha.md)
  ✓  81 test/e2e/tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (1.8s)
argv title wait: 473 ms (large.md)
  ✓  82 test/e2e/tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (16.4s)
argv title wait: 758 ms (alpha.md)
  ✓  83 test/e2e/tabs.spec.ts:204:5 › the Open menu focuses an existing path without a duplicate @AC-R4-02 (5.6s)
argv title wait: 732 ms (alpha.md)
  ✓  84 test/e2e/tabs.spec.ts:224:5 › a second instance focuses an existing path without a duplicate @AC-R4-02 (4.1s)
argv title wait: 663 ms (alpha.md)
  ✓  85 test/e2e/tabs.spec.ts:243:5 › Save As refuses a path that another open tab owns @AC-R4-02 (3.9s)
argv title wait: 629 ms (alpha.md)
  ✓  86 test/e2e/tabs.spec.ts:274:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (3.4s)
argv title wait: 562 ms (alpha.md)
  ✓  87 test/e2e/tabs.spec.ts:305:5 › closing a clean tab closes it with no prompt @AC-R4-04 (2.6s)
argv title wait: 567 ms (alpha.md)
  ✓  88 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Cancel keeps it open @AC-R4-05 (3.7s)
argv title wait: 436 ms (alpha.md)
  ✓  89 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Discard closes without writing @AC-R4-05 (2.9s)
argv title wait: 402 ms (alpha.md)
  ✓  90 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Save writes and closes @AC-R4-05 (3.0s)
argv title wait: 495 ms (alpha.md)
  ✓  91 test/e2e/tabs.spec.ts:376:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (2.7s)
  ✓  92 test/e2e/workspace-sidebar.spec.ts:46:5 › Open Folder shows a lazy Markdown tree @AC-R11-01 (2.4s)
AC-R11-02 expand p95 95.0 ms
  ✓  93 test/e2e/workspace-sidebar.spec.ts:71:5 › a second expand reuses loaded children and keeps editing responsive @AC-R11-02 (7.3s)
  ✓  94 test/e2e/workspace-sidebar.spec.ts:112:5 › the workspace filter keeps matching file ancestors @AC-R11-03 (2.7s)
AC-R11-04 open p95 49.4 ms
  ✓  95 test/e2e/workspace-sidebar.spec.ts:132:5 › clicking a workspace file opens and reuses its tab @AC-R11-04 (5.6s)


  1) test/e2e/preview-perf.spec.ts:143:5 › AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms @AC-PERF-10 

    Error: AC-PERF-10 open task failed. largest=start 1282.8 ms duration 111.0 ms marks=[preview-apply-start@1255.2, preview-apply-end@1270.3, preview-apply-start@1270.4, preview-apply-end@1275.4, preview-apply-start@1275.6, preview-apply-end@1277.6, preview-apply-start@1395.1, preview-apply-end@1399.2, preview-apply-start@1404.9, preview-apply-end@1409.4, preview-apply-start@1431.2, preview-apply-end@1435.3, preview-apply-start@1435.5, preview-apply-end@1438.4]

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 6

    - Array []
    + Array [
    +   Object {
    +     "duration": 111,
    +     "start": 1282.7999999999884,
    +   },
    + ]

      183 |       afterOpen.filter((entry) => entry.duration >= 100),
      184 |       `AC-PERF-10 open task failed. ${diagnostics}`,
    > 185 |     ).toEqual([]);
          |       ^
      186 |   } finally {
      187 |     await closeEditor(application, page);
      188 |   }
        at /Users/runner/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:185:7

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-10-op-a5efd-in-thread-task-under-100-ms/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/preview-perf-AC-PERF-10-op-a5efd-in-thread-task-under-100-ms/error-context.md

    Error Context: test-results/preview-perf-AC-PERF-10-op-a5efd-in-thread-task-under-100-ms/error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/preview-perf-AC-PERF-10-op-a5efd-in-thread-task-under-100-ms/trace.zip
    Usage:

        npx playwright show-trace test-results/preview-perf-AC-PERF-10-op-a5efd-in-thread-task-under-100-ms/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    test/e2e/preview-perf.spec.ts:143:5 › AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms @AC-PERF-10 
  2 skipped
  92 passed (5.0m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1107 | 0 | 1107 |
| e2e-junit.xml | 92 | 3 | 95 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
