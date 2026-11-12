# sidebar-e2e-load-flake investigation

Date: 2026-11-12.

## Result

The artifact does not prove the stalled quit step.
It only bounds the stall to app quit.
No runtime timeout change is justified.

The merged tree keeps one 15,000 ms close-ask timeout.
This timeout prevents a dirty-data loss path.
A busy renderer can reach `handleSessionClose` after four seconds.
It then sends the first keepalive after `flushDirty` completes.
A 4,000 ms deadline could close the window first.
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

The broker gives session persistence a nominal 5,000 ms timeout.
The artifact cannot separate this write from the close ask.
A late acknowledgement can leave insufficient time before this write timeout expires.
The artifact contains no write timing marks.
A final allow reply just before 15,000 ms can use another 5,000 ms to persist.
With a responsive main event loop, the broker can therefore take almost
20,000 ms to settle without a user prompt. That exceeds both the 15,000 ms
test budget and the observed 11,300 ms remainder. These timers are not a hard
wall-clock bound. If the main event loop cannot run their callbacks, the real
settle time is unbounded.

### 3. Window close or quit resume

`window.ts` closes the window after the request resolves.
That path has no awaited work after the allow result.
`startup.ts` also has no await in `before-quit` or `window-all-closed`.
These candidates are unlikely, but the artifact cannot exclude them.

### 4. Windows 5,001-row expand loop

AC-R11-02 took 12.5 seconds in the latest local run.
The row renders 5,001 rows and runs 30 expand cycles.
The Windows timeout could occur in this loop or during quit.
Run 43027415248 is required to separate those candidates.
GitHub still retains artifact `failure-windows-latest` as ID 13859052076.
The artifact download requires authentication.
This lane has no GitHub credentials, so I could not inspect its trace.

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

Two close-request tests failed when the default was mutated to 4,000 ms.
At 4,001 ms, the request had resolved and the snapshot was ignored.
All 10 close-request tests passed after reverting to the 15,000 ms timeout.
The stalled-write probe recorded the 15,000 ms ask and 5,000 ms write timeouts.
`npm run typecheck` passed.
`npm run check:deps` passed for 153 modules and 333 dependencies.
`npm run test:unit` passed 1,185 tests in 116 files.
`npm run check:coverage` passed every ratchet.
Statements measured 99.07 percent.
Branches measured 97.29 percent.
Functions measured 99.23 percent.
Lines measured 99.22 percent.
The production build passed.
The 88-test non-performance e2e suite passed, including all four sidebar rows.
AC-R11-02 measured 264.2 ms expand p95.
AC-R11-04 measured 55.9 ms open p95.

The full local e2e rerun passed 96 of 98 tests. AC-PERF-09 did not finish the
20 MB preview fill inside 360 seconds. Its 114,567 blocks require more than
14,000 serialized eight-block fill handshakes. The next AC-PERF-11 row then
missed its first-preview budget at 1,139 ms, but passed alone at 572 ms.
Those renderer files are outside this brief, and the perf09 owner records the
same 20 MB fill failure, so this investigation made no preview or
performance-test change.
