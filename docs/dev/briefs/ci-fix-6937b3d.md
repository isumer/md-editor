# Fix: CI red on main at 6937b3d

Main's CI failed after merge 6937b3d: CI run 42861630005: failure.
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
argv title wait: 119 ms (assets.md)
  ok 57 test\e2e\preview.spec.ts:64:5 › editing one block does not re-request another block's image @AC-R1-11 (1.1s)
argv title wait: 138 ms (alpha.md)
  ok 58 test\e2e\recovery.spec.ts:50:5 › quitting with dirty tabs prompts, and Save writes every document @AC-R4-06 (1.1s)
argv title wait: 282 ms (alpha.md)
  ok 59 test\e2e\recovery.spec.ts:79:5 › quitting with dirty tabs can discard without writing files @AC-R4-06 (1.2s)
argv title wait: 129 ms (alpha.md)
  ok 60 test\e2e\recovery.spec.ts:102:5 › a renderer crash recovers the last draft @AC-R4-07 (4.2s)
  ok 61 test\e2e\recovery.spec.ts:144:5 › a crash recovers an untitled document from its draft @AC-R4-07 (3.9s)
argv title wait: 250 ms (alpha.md)
  ok 62 test\e2e\recovery.spec.ts:184:5 › discarding a dirty tab clears its draft so a crash does not restore it @AC-R4-05 (4.5s)
argv title wait: 120 ms (alpha.md)
  ok 63 test\e2e\recovery.spec.ts:234:5 › closing and reopening restores the session with its documents @AC-R4-08 (1.8s)
argv title wait: 137 ms (sample.md)
  ok 64 test\e2e\recovery.spec.ts:269:5 › a stuck render worker is restarted within 2.5 s and typing stays responsive @AC-R1-12 (2.9s)
argv title wait: 134 ms (original.md)
  ok 65 test\e2e\save-contracts.spec.ts:31:5 › Save As writes the chosen path and later Save uses it @AC-R5-10 (1.2s)
  ok 66 test\e2e\save-contracts.spec.ts:70:5 › Save on an untitled document asks for a path and writes it @AC-R5-11 (1.1s)
argv title wait: 137 ms (current.md)
  ok 67 test\e2e\save-contracts.spec.ts:97:5 › cancelling Open leaves the dirty document and disk unchanged @AC-R5-12 (1.2s)
argv title wait: 130 ms (current.md)
  ok 68 test\e2e\save-contracts.spec.ts:130:5 › cancelling Save As leaves the dirty document and disk unchanged @AC-R5-12 (1.0s)
argv title wait: 141 ms (current.md)
  ok 69 test\e2e\save-contracts.spec.ts:163:5 › an edit made while Save is in flight stays dirty and off disk @AC-R5-14 (1.0s)
argv title wait: 124 ms (current.md)
  ok 70 test\e2e\save-contracts.spec.ts:208:5 › Save writes exactly the edited document version @AC-R5-18 (1.3s)
argv title wait: 138 ms (sample.md)
  ok 71 test\e2e\save-contracts.spec.ts:235:5 › the Open menu item opens the file chosen by its dialog @AC-R5-15 (959ms)
argv title wait: 156 ms (current.md)
  ok 72 test\e2e\save-contracts.spec.ts:258:5 › the Save menu item writes the current document @AC-R5-15 (1.2s)
argv title wait: 719 ms (sample.md)
  ok 73 test\e2e\save-contracts.spec.ts:283:5 › the Save As menu item writes the path chosen by its dialog @AC-R5-15 (1.6s)
argv title wait: 260 ms (current.md)
  ok 74 test\e2e\save-contracts.spec.ts:306:5 › opening another file keeps the dirty document and Save still writes it @AC-R5-09 (1.1s)
argv title wait: 134 ms (alpha.md)
  ok 75 test\e2e\tabs.spec.ts:61:5 › two tabs keep their own text, cursor, selection, scroll and undo history @AC-R4-01 (1.4s)
argv title wait: 442 ms (alpha.md)
  ok 76 test\e2e\tabs.spec.ts:138:5 › switching back reconnects the same preview blocks without appending @AC-R4-01 (1.2s)
argv title wait: 145 ms (large.md)
  ok 77 test\e2e\tabs.spec.ts:172:5 › switching back resumes an incomplete preview fill @AC-R4-01 (17.6s)
argv title wait: 146 ms (alpha.md)
  x  78 test\e2e\tabs.spec.ts:204:5 › opening a path that is already open focuses its tab without a duplicate @AC-R4-02 (15.0s)
argv title wait: 178 ms (alpha.md)
  x  79 test\e2e\tabs.spec.ts:229:5 › Save As refuses a path that another open tab owns @AC-R4-02 (15.0s)
argv title wait: 202 ms (alpha.md)
  ok 80 test\e2e\tabs.spec.ts:260:5 › only the dirty tab is marked, and saving or undoing clears it @AC-R4-03 (12.7s)
argv title wait: 208 ms (alpha.md)
  ok 81 test\e2e\tabs.spec.ts:291:5 › closing a clean tab closes it with no prompt @AC-R4-04 (9.5s)
argv title wait: 193 ms (alpha.md)
  ok 82 test\e2e\tabs.spec.ts:323:7 › closing a dirty tab: Cancel keeps it open @AC-R4-05 (1.1s)
argv title wait: 136 ms (alpha.md)
  ok 83 test\e2e\tabs.spec.ts:323:7 › closing a dirty tab: Discard closes without writing @AC-R4-05 (1.8s)
argv title wait: 145 ms (alpha.md)
  ok 84 test\e2e\tabs.spec.ts:323:7 › closing a dirty tab: Save writes and closes @AC-R4-05 (1.3s)
argv title wait: 440 ms (alpha.md)
  ok 85 test\e2e\tabs.spec.ts:362:5 › dropping a file onto the window opens it in a new tab @AC-R4-09 (1.3s)
  ok 86 test\e2e\workspace-sidebar.spec.ts:46:5 › Open Folder shows a lazy Markdown tree @AC-R11-01 (1.7s)
AC-R11-02 expand p95 67.8 ms
  ok 87 test\e2e\workspace-sidebar.spec.ts:71:5 › a second expand reuses loaded children and keeps editing responsive @AC-R11-02 (8.6s)
  ok 88 test\e2e\workspace-sidebar.spec.ts:112:5 › the workspace filter keeps matching file ancestors @AC-R11-03 (860ms)
AC-R11-04 open p95 24.7 ms
  ok 89 test\e2e\workspace-sidebar.spec.ts:132:5 › clicking a workspace file opens and reuses its tab @AC-R11-04 (3.6s)


  1) test\e2e\tabs.spec.ts:204:5 › opening a path that is already open focuses its tab without a duplicate @AC-R4-02 

    Test timeout of 15000ms exceeded.

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results\tabs-opening-a-path-that-i-4bb3e-its-tab-without-a-duplicate\test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results\tabs-opening-a-path-that-i-4bb3e-its-tab-without-a-duplicate\error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\tabs-opening-a-path-that-i-4bb3e-its-tab-without-a-duplicate\trace.zip
    Usage:

        npx playwright show-trace test-results\tabs-opening-a-path-that-i-4bb3e-its-tab-without-a-duplicate\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2) test\e2e\tabs.spec.ts:229:5 › Save As refuses a path that another open tab owns @AC-R4-02 ─────

    Test timeout of 15000ms exceeded.

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results\tabs-Save-As-refuses-a-path-that-another-open-tab-owns\test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results\tabs-Save-As-refuses-a-path-that-another-open-tab-owns\error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\tabs-Save-As-refuses-a-path-that-another-open-tab-owns\trace.zip
    Usage:

        npx playwright show-trace test-results\tabs-Save-As-refuses-a-path-that-another-open-tab-owns\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2 failed
    test\e2e\tabs.spec.ts:204:5 › opening a path that is already open focuses its tab without a duplicate @AC-R4-02 
    test\e2e\tabs.spec.ts:229:5 › Save As refuses a path that another open tab owns @AC-R4-02 ──────
  87 passed (7.6m)
##[error]Process completed with exit code 1.
##[group]Run node scripts/summarize-junit.mjs
[36;1mnode scripts/summarize-junit.mjs[0m
shell: C:\Program Files\PowerShell\7\pwsh.EXE -command ". '{0}'"
##[endgroup]
## JUnit test summary

| Report | Passed | Not passing | Total |
|---|---:|---:|---:|
| unit-junit.xml | 1096 | 2 | 1098 |
| e2e-junit.xml | 87 | 2 | 89 |
##[group]Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9

```
