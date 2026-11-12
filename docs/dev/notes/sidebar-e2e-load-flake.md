# sidebar-e2e-load-flake investigation

Date: 2026-11-12.

## Result

The artifact does not prove the stalled quit step.
It only bounds the stall to app quit.
No runtime timeout change is justified.

The branch restored one 15,000 ms close-ask timeout.
This restoration prevents a new dirty-data loss path.
A busy renderer can reach `handleSessionClose` after four seconds.
It then sends the first keepalive after `flushDirty` completes.
The removed 4,000 ms deadline could close the window first.
That close had no prompt and no session snapshot.
The late reply could not persist data because the request was already deleted.

## macOS artifact data

- The test body finished about 2.8 seconds after launch.
- `Close context` started about 3.7 seconds after launch.
- The runner killed the test 11.4 seconds after close started.
- Every body assertion passed.
- The screenshot showed the expected final state.
- About 11.3 seconds of the test budget remained when close started.

These facts do not separate the close ask from the session write.
They also do not identify window close or quit resume as the stall.

## Ranked candidates

### 1. Lost or late first acknowledgement

The close ask has one 15,000 ms timeout.
That timeout exceeds the remaining 11.3-second test budget.
A lost acknowledgement would therefore exceed the budget.
The artifact does not show whether the acknowledgement arrived.

This candidate ranks first because its bound exceeds the observed remaining budget.
It is not a proven cause.

### 2. Stalled session write

The broker bounds session persistence at 5,000 ms.
The artifact cannot separate this write from the close ask.
A late acknowledgement can leave insufficient time for this bounded write.
The artifact contains no write timing marks.

### 3. Window close or quit resume

`window.ts` closes the window after the request resolves.
That path has no awaited work after the allow result.
`startup.ts` also has no await in `before-quit` or `window-all-closed`.
These candidates are unlikely, but the artifact cannot exclude them.

### 4. Windows 5,001-row expand loop

AC-R11-02 took 10.9 seconds locally.
The row renders 5,001 rows and runs 30 expand cycles.
The Windows timeout could occur in this loop or during quit.
Run 43027415248 is required to separate those candidates.
`gh` is unavailable in these lanes, so I could not download that run.

## Close helper diagnostic

A bounded `closeEditor` wait is appropriate for diagnosis.
It must throw an error that names the stalled step.
It must never swallow a real quit hang.

The diagnostic needs an injected broker `onStall` hook and `main.ts` wiring.
This brief does not allow `main.ts`.
The next owner must add that file to a narrow brief scope.
Its unit test must leave the acknowledgement unanswered.
The hook must then report the ask step.

## Required evidence from later legs

The next macOS leg must record these timestamps:

- The main process sends the close ask.
- The renderer starts `handleSessionClose`.
- The renderer completes `flushDirty`.
- The renderer sends its first keepalive.
- The main process receives the keepalive or final reply.
- Session persistence starts and finishes.
- The allowed window close starts and finishes.
- `before-quit` and `window-all-closed` resume quit.

The next Windows leg must record the same quit timestamps.
It must also record the 5,001-row loop start and finish.
These marks must show whether AC-R11-02 spends its budget before quit.

Several full-suite runs must pass on macOS and Windows before closing this flake.

## Validation

The fake-clock regression test failed with the 4,000 ms default.
At 4,001 ms, the request had resolved and the snapshot was ignored.
The test passed after restoring the 15,000 ms timeout.
`npm run typecheck` passed.
`npm run check:deps` passed for 153 modules and 333 dependencies.
`npm run test:unit` passed 1,185 tests in 116 files.
`npm run check:coverage` passed every ratchet.
Statements measured 99.07 percent.
Branches measured 97.29 percent.
Functions measured 99.23 percent.
Lines measured 99.22 percent.
The production build passed.
The four affected sidebar e2e tests passed once without `@AC-PERF`.
AC-R11-02 measured 281.7 ms expand p95.
AC-R11-04 measured 52.6 ms open p95.
