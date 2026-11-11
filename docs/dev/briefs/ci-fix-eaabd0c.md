# Fix: CI red on main at eaabd0c

Main's CI failed after merge eaabd0c: CI run 42926019979: failure.
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
  ✓  63 test/e2e/recovery.spec.ts:144:5 › a crash recovers an untitled document from its draft @AC-R4-07 (4.5s)
argv title wait: 114 ms (alpha.md)
  ✓  64 test/e2e/recovery.spec.ts:184:5 › discarding a dirty tab clears its draft so a crash does not restore it @AC-R4-05 (4.6s)
argv title wait: 124 ms (alpha.md)
  ✓  65 test/e2e/recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (1.3s)
argv title wait: 124 ms (sample.md)
  ✓  66 test/e2e/recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (2.6s)
argv title wait: 122 ms (original.md)
  ✓  67 test/e2e/save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (955ms)
  ✓  68 test/e2e/save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (695ms)
argv title wait: 130 ms (current.md)
  ✓  69 test/e2e/save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (761ms)
argv title wait: 121 ms (current.md)
  ✓  70 test/e2e/save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (735ms)
argv title wait: 123 ms (current.md)
  ✓  71 test/e2e/save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (716ms)
argv title wait: 114 ms (current.md)
  ✓  72 test/e2e/save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (773ms)
argv title wait: 122 ms (sample.md)
  ✓  73 test/e2e/save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (639ms)
argv title wait: 121 ms (current.md)
  ✓  74 test/e2e/save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (766ms)
argv title wait: 122 ms (sample.md)
  ✓  75 test/e2e/save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (629ms)
argv title wait: 129 ms (current.md)
  ✓  76 test/e2e/save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (775ms)
argv title wait: 121 ms (read-only.md)
  ✓  77 test/e2e/save-contracts.spec.ts:339:7 › saving a read-only file names it and explains the permission failure @AC-R5-16 (697ms)
argv title wait: 124 ms (read-only.md)
  ✓  78 test/e2e/save-contracts.spec.ts:363:7 › a save failure stays visible when the preview renders the next edit @AC-R5-16 (748ms)
argv title wait: 121 ms (alpha.md)
  ✓  79 test/e2e/tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (1.1s)
argv title wait: 136 ms (alpha.md)
  ✓  80 test/e2e/tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (670ms)
argv title wait: 136 ms (large.md)
  ✓  81 test/e2e/tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (10.9s)
argv title wait: 118 ms (alpha.md)
  ✓  82 test/e2e/tabs.spec.ts:204:5 › the Open menu focuses an existing path without a duplicate @AC-R4-02 (639ms)
argv title wait: 119 ms (alpha.md)
  ✓  83 test/e2e/tabs.spec.ts:224:5 › a second instance focuses an existing path without a duplicate @AC-R4-02 (809ms)
argv title wait: 124 ms (alpha.md)
  ✓  84 test/e2e/tabs.spec.ts:243:5 › Save As refuses a path that another open tab owns @AC-R4-02 (846ms)
argv title wait: 127 ms (alpha.md)
  ✓  85 test/e2e/tabs.spec.ts:274:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (766ms)
argv title wait: 128 ms (alpha.md)
  ✓  86 test/e2e/tabs.spec.ts:305:5 › closing a clean tab closes it with no prompt @AC-R4-04 (669ms)
argv title wait: 135 ms (alpha.md)
  ✓  87 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Cancel keeps it open @AC-R4-05 (820ms)
argv title wait: 129 ms (alpha.md)
  ✓  88 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Discard closes without writing @AC-R4-05 (722ms)
argv title wait: 135 ms (alpha.md)
  ✓  89 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Save writes and closes @AC-R4-05 (727ms)
argv title wait: 121 ms (alpha.md)
  ✓  90 test/e2e/tabs.spec.ts:376:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (708ms)
  ✓  91 test/e2e/workspace-sidebar.spec.ts:46:5 › Open Folder shows a lazy Markdown tree @AC-R11-01 (589ms)
AC-R11-02 expand p95 53.3 ms
  ✓  92 test/e2e/workspace-sidebar.spec.ts:71:5 › a second expand reuses loaded children and keeps editing responsive @AC-R11-02 (3.3s)
  ✓  93 test/e2e/workspace-sidebar.spec.ts:112:5 › the workspace filter keeps matching file ancestors @AC-R11-03 (581ms)
AC-R11-04 open p95 28.1 ms
  ✓  94 test/e2e/workspace-sidebar.spec.ts:132:5 › clicking a workspace file opens and reuses its tab @AC-R11-04 (2.8s)


  1) test/e2e/preview-perf.spec.ts:417:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   33.29999999998836,
    + ]

      390 |     `longtaskDurations=[${distribution(probe.longtasks)}]`,
      391 |   );
    > 392 |   expect(slowFrames).toEqual([]);
          |                      ^
      393 |   expect(probe.longtasks).toEqual([]);
      394 | }
      395 |
        at expectSmoothScroll (~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:392:22)
        at ~/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:432:5

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

  1 failed
    test/e2e/preview-perf.spec.ts:417:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 
  93 passed (5.8m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /usr/bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1107 | 0 | 1107 |
| e2e-junit.xml | 93 | 1 | 94 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
with:
argv title wait: 472 ms (alpha.md)
  ✓  60 test/e2e/recovery.spec.ts:50:5 › quitting with dirty tabs prompts, and Save writes every document @AC-R4-06 (2.8s)
argv title wait: 287 ms (alpha.md)
  ✓  61 test/e2e/recovery.spec.ts:79:5 › quitting with dirty tabs can discard without writing files @AC-R4-06 (4.9s)
argv title wait: 443 ms (alpha.md)
  ✓  62 test/e2e/recovery.spec.ts:102:5 › a renderer crash recovers the last draft @AC-R4-07 (5.8s)
  ✓  63 test/e2e/recovery.spec.ts:144:5 › a crash recovers an untitled document from its draft @AC-R4-07 (5.3s)
argv title wait: 169 ms (alpha.md)
  ✓  64 test/e2e/recovery.spec.ts:184:5 › discarding a dirty tab clears its draft so a crash does not restore it @AC-R4-05 (9.8s)
argv title wait: 796 ms (alpha.md)
  ✓  65 test/e2e/recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (13.6s)
argv title wait: 512 ms (sample.md)
  ✓  66 test/e2e/recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (6.7s)
argv title wait: 183 ms (original.md)
  ✓  67 test/e2e/save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (2.7s)
  ✓  68 test/e2e/save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (2.2s)
argv title wait: 434 ms (current.md)
  ✓  69 test/e2e/save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (2.1s)
argv title wait: 409 ms (current.md)
  ✓  70 test/e2e/save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (2.1s)
argv title wait: 226 ms (current.md)
  ✓  71 test/e2e/save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (2.1s)
argv title wait: 257 ms (current.md)
  ✓  72 test/e2e/save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (2.1s)
argv title wait: 449 ms (sample.md)
  ✓  73 test/e2e/save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (1.9s)
argv title wait: 415 ms (current.md)
  ✓  74 test/e2e/save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (1.9s)
argv title wait: 474 ms (sample.md)
  ✓  75 test/e2e/save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (1.9s)
argv title wait: 126 ms (current.md)
  ✓  76 test/e2e/save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (1.6s)
argv title wait: 515 ms (read-only.md)
  ✓  77 test/e2e/save-contracts.spec.ts:339:7 › saving a read-only file names it and explains the permission failure @AC-R5-16 (2.1s)
argv title wait: 543 ms (read-only.md)
  ✓  78 test/e2e/save-contracts.spec.ts:363:7 › a save failure stays visible when the preview renders the next edit @AC-R5-16 (2.4s)
argv title wait: 441 ms (alpha.md)
  ✓  79 test/e2e/tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (3.4s)
argv title wait: 246 ms (alpha.md)
  ✓  80 test/e2e/tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (2.0s)
argv title wait: 402 ms (large.md)
  ✓  81 test/e2e/tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (14.5s)
argv title wait: 479 ms (alpha.md)
  ✓  82 test/e2e/tabs.spec.ts:204:5 › the Open menu focuses an existing path without a duplicate @AC-R4-02 (2.5s)
argv title wait: 541 ms (alpha.md)
  ✓  83 test/e2e/tabs.spec.ts:224:5 › a second instance focuses an existing path without a duplicate @AC-R4-02 (2.8s)
argv title wait: 462 ms (alpha.md)
  ✓  84 test/e2e/tabs.spec.ts:243:5 › Save As refuses a path that another open tab owns @AC-R4-02 (2.3s)
argv title wait: 167 ms (alpha.md)
  ✓  85 test/e2e/tabs.spec.ts:274:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (1.8s)
argv title wait: 475 ms (alpha.md)
  ✓  86 test/e2e/tabs.spec.ts:305:5 › closing a clean tab closes it with no prompt @AC-R4-04 (2.0s)
argv title wait: 435 ms (alpha.md)
  ✓  87 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Cancel keeps it open @AC-R4-05 (2.4s)
argv title wait: 426 ms (alpha.md)
  ✓  88 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Discard closes without writing @AC-R4-05 (2.2s)
argv title wait: 505 ms (alpha.md)
  ✓  89 test/e2e/tabs.spec.ts:337:7 › closing a dirty tab: Save writes and closes @AC-R4-05 (2.6s)
argv title wait: 476 ms (alpha.md)
  ✓  90 test/e2e/tabs.spec.ts:376:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (1.9s)
  ✓  91 test/e2e/workspace-sidebar.spec.ts:46:5 › Open Folder shows a lazy Markdown tree @AC-R11-01 (1.7s)
AC-R11-02 expand p95 95.8 ms
  ✓  92 test/e2e/workspace-sidebar.spec.ts:71:5 › a second expand reuses loaded children and keeps editing responsive @AC-R11-02 (6.7s)
  ✓  93 test/e2e/workspace-sidebar.spec.ts:112:5 › the workspace filter keeps matching file ancestors @AC-R11-03 (2.1s)
AC-R11-04 open p95 38.2 ms
  ✓  94 test/e2e/workspace-sidebar.spec.ts:132:5 › clicking a workspace file opens and reuses its tab @AC-R11-04 (6.0s)


  1) test/e2e/preview-perf.spec.ts:438:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 

    Error: expect(received).toBeLessThan(expected)

    Expected: < 1000
    Received:   1136

      472 |     );
      473 |     expect(editableAfter).toBeLessThan(1_500);
    > 474 |     expect(previewAfter).toBeLessThan(1_000);
          |                          ^
      475 |   } finally {
      476 |     await closeEditor(application, page);
      477 |   }
        at /Users/runner/work/solidmd/solidmd/test/e2e/preview-perf.spec.ts:474:26

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
    test/e2e/preview-perf.spec.ts:438:5 › AC-PERF-11: a 20 MB document is editable and shows its first screen in time @AC-PERF-11 
  2 skipped
  91 passed (5.1m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: /bin/bash -e {0}
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1107 | 0 | 1107 |
| e2e-junit.xml | 91 | 3 | 94 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
