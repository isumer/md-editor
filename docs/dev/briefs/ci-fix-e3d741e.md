# Fix: CI red on main at e3d741e

Main's CI failed after merge e3d741e: CI run 42902826616: failure.
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
argv title wait: 127 ms (alpha.md)
  ok 59 test\e2e\recovery.spec.ts:79:5 › quitting with dirty tabs can discard without writing files @AC-R4-06 (957ms)
argv title wait: 132 ms (alpha.md)
  ok 60 test\e2e\recovery.spec.ts:102:5 › a renderer crash recovers the last draft @AC-R4-07 (4.0s)
  ok 61 test\e2e\recovery.spec.ts:144:5 › a crash recovers an untitled document from its draft @AC-R4-07 (3.8s)
argv title wait: 134 ms (alpha.md)
  ok 62 test\e2e\recovery.spec.ts:184:5 › discarding a dirty tab clears its draft so a crash does not restore it @AC-R4-05 (4.1s)
argv title wait: 137 ms (alpha.md)
  ok 63 test\e2e\recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (1.6s)
argv title wait: 132 ms (sample.md)
  ok 64 test\e2e\recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (2.8s)
argv title wait: 125 ms (original.md)
  ok 65 test\e2e\save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (1.2s)
  ok 66 test\e2e\save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (935ms)
argv title wait: 121 ms (current.md)
  ok 67 test\e2e\save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (990ms)
argv title wait: 134 ms (current.md)
  ok 68 test\e2e\save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (998ms)
argv title wait: 127 ms (current.md)
  ok 69 test\e2e\save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (931ms)
argv title wait: 136 ms (current.md)
  ok 70 test\e2e\save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (998ms)
argv title wait: 133 ms (sample.md)
  ok 71 test\e2e\save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (736ms)
argv title wait: 411 ms (current.md)
  ok 72 test\e2e\save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (1.2s)
argv title wait: 450 ms (sample.md)
  ok 73 test\e2e\save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (1.1s)
argv title wait: 146 ms (current.md)
  ok 74 test\e2e\save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (989ms)
argv title wait: 149 ms (alpha.md)
  ok 75 test\e2e\tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (1.6s)
argv title wait: 148 ms (alpha.md)
  ok 76 test\e2e\tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (828ms)
argv title wait: 141 ms (large.md)
  ok 77 test\e2e\tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (11.0s)
argv title wait: 379 ms (alpha.md)
  ok 78 test\e2e\tabs.spec.ts:204:5 › the Open menu focuses an existing path without a duplicate @AC-R4-02 (950ms)
argv title wait: 171 ms (alpha.md)
  ok 79 test\e2e\tabs.spec.ts:224:5 › a second instance focuses an existing path without a duplicate @AC-R4-02 (949ms)
argv title wait: 147 ms (alpha.md)
  ok 80 test\e2e\tabs.spec.ts:243:5 › Save As refuses a path that another open tab owns @AC-R4-02 (1.2s)
argv title wait: 132 ms (alpha.md)
  ok 81 test\e2e\tabs.spec.ts:274:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (885ms)
argv title wait: 145 ms (alpha.md)
  ok 82 test\e2e\tabs.spec.ts:305:5 › closing a clean tab closes it with no prompt @AC-R4-04 (835ms)
argv title wait: 163 ms (alpha.md)
  ok 83 test\e2e\tabs.spec.ts:337:7 › closing a dirty tab: Cancel keeps it open @AC-R4-05 (1.2s)
argv title wait: 146 ms (alpha.md)
  ok 84 test\e2e\tabs.spec.ts:337:7 › closing a dirty tab: Discard closes without writing @AC-R4-05 (912ms)
argv title wait: 147 ms (alpha.md)
  ok 85 test\e2e\tabs.spec.ts:337:7 › closing a dirty tab: Save writes and closes @AC-R4-05 (949ms)
argv title wait: 203 ms (alpha.md)
  ok 86 test\e2e\tabs.spec.ts:376:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (877ms)
  ok 87 test\e2e\workspace-sidebar.spec.ts:46:5 › Open Folder shows a lazy Markdown tree @AC-R11-01 (754ms)
AC-R11-02 expand p95 63.6 ms
  ok 88 test\e2e\workspace-sidebar.spec.ts:71:5 › a second expand reuses loaded children and keeps editing responsive @AC-R11-02 (6.4s)
  ok 89 test\e2e\workspace-sidebar.spec.ts:112:5 › the workspace filter keeps matching file ancestors @AC-R11-03 (773ms)
AC-R11-04 open p95 25.8 ms
  ok 90 test\e2e\workspace-sidebar.spec.ts:132:5 › clicking a workspace file opens and reuses its tab @AC-R11-04 (3.1s)


  1) test\e2e\preview-perf.spec.ts:417:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 3

    - Array []
    + Array [
    +   171.90000000002328,
    + ]

      390 |     `longtaskDurations=[${distribution(probe.longtasks)}]`,
      391 |   );
    > 392 |   expect(slowFrames).toEqual([]);
          |                      ^
      393 |   expect(probe.longtasks).toEqual([]);
      394 | }
      395 |
        at expectSmoothScroll (D:\a\solidmd\solidmd\test\e2e\preview-perf.spec.ts:392:22)
        at D:\a\solidmd\solidmd\test\e2e\preview-perf.spec.ts:432:5

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results\preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms\test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results\preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms\error-context.md

    Error Context: test-results\preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms\error-context.md

    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms\trace.zip
    Usage:

        npx playwright show-trace test-results\preview-perf-AC-PERF-09-fl-08716-iew-has-no-frame-over-32-ms\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    test\e2e\preview-perf.spec.ts:417:5 › AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms @AC-PERF-09 
  89 passed (6.4m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: C:\Program Files\PowerShell\7\pwsh.EXE -command ". '{0}'"
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1102 | 2 | 1104 |
| e2e-junit.xml | 89 | 1 | 90 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
with:

```
