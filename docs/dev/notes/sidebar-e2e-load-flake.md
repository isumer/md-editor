# sidebar-e2e-load-flake investigation

Date: 2026-11-12.

## Result

The close ask had a 15,000 ms timeout. The e2e test budget is also 15,000 ms.
One lost ack therefore used the whole budget. A fix now splits the deadlines.
The first-ack deadline is 4,000 ms. The prompt keepalive deadline stays 15,000 ms.
The worst case before the window close and the process exit fell from 20,000 ms
to 9,000 ms for a lost first ack. The keepalive deadline keeps its old 15,000 ms
bound. If an open prompt sends keepalives and the final answer never comes, the
ask can still take 15,000 ms plus up to 5,000 ms for the write. That path needs a
renderer that stops answering after a keepalive, so it is not the e2e case.

The artifacts cannot prove which quit step lost time. They do prove one defect
that guarantees a timeout after a lost ack. The fix removes that defect.

## Facts from the macOS failure artifact

- The body finished at about +2.8 s after launch.
- `Close context` started at about +3.7 s and never finished.
- The runner killed the test 11.4 s after `Close context` started.
- Every assertion in the body passed.
- The test had no dirty document at close time.

## Answers

### 1. Which quit step stalls

The artifact bounds the stall to the app quit. It cannot separate the close ask
from the session write.

- The close ask (`src/main/app/closeRequests.ts`) starts a 15,000 ms timer.
- The session write (`src/main/ipc/session.ts` via `SessionStore` and the
  io-worker) is bounded at 5,000 ms by the broker.
- The window close (`src/main/app/window.ts`) has no await after the allow.
- The quit resume (`src/main/app/startup.ts`) has no await in `before-quit` or
  `window-all-closed`.
- The io-worker stop on `will-quit` is synchronous.

The close ask is the only step with a deadline near the test budget.

### 2. Ask timeout and worst-case settle time

The old ask timeout was 15,000 ms. That value equals the e2e test budget.
The worst case was 15,000 ms for a late ack plus 5,000 ms for a stalled write.
That sum is 20,000 ms before the window close and the process exit.
The macOS body spent about 3.7 s before the close began.
About 11.3 s of the 15 s budget remained. So one lost ack was a guaranteed
test timeout.

The new deadlines give these bounds:

- An unanswered ask settles in 4,000 ms.
- A late ack plus a stalled write settles in 9,000 ms.

The unit test pins the 9,000 ms sum below a 10,000 ms cap.

### 3. Does AC-R11-02 on Windows share the quit path

I could not download run 43027415248 in this lane. The `gh` download was denied.
So I cannot say whether the artifact is retained.

The quit path is a candidate for this row too. The body is a second candidate.
The same test took 10.9 s on this machine. It renders 5,001 rows and runs 30
expand cycles. A loaded Windows runner can spend the budget in that loop.

The two candidates are not separated without the artifact or a Windows trace.

### 4. Is a bounded `closeEditor` right

Yes for diagnosis, with one condition. A bounded wait must throw and name the
stall. It must never swallow a real quit hang. I did not change the helper.

Two reasons kept the helper unchanged:

- The e2e glob is still owned by the perf09-ubuntu-flake candidate.
- The product fix removes the only deadline that equals the test budget.

A later owner can add the bounded wait when the e2e glob is free.

## Mechanism test

`test/unit/closeRequests.test.ts` has a new test:
"a late ack and a stalled session write fit inside the e2e test budget".
The test adds the two configured deadlines.
The test requires the sum to stay below 10,000 ms.

- Red on the parent source: 20,000 ms (15,000 + 5,000).
- Green after the fix: 9,000 ms (4,000 + 5,000).

An extended existing test checks the keepalive path.
A keepalive restarts the timer at 15,000 ms.
That value is above the renderer's 5,000 ms keepalive interval.
So an open prompt cannot time out between two keepalives.

A second new test pins the default keepalive deadline. It builds the broker
without timeout options and expects a keepalive restart at 15,000 ms. A mutation
that changed the default to 4,000 ms first passed every test, so this test
closes that gap.

## Fix

Changed files:

- `src/main/app/closeRequests.ts`
- `test/unit/closeRequests.test.ts`

The broker has two deadlines:

- `ackTimeoutMilliseconds` bounds the wait for the first ack. The default is
  4,000 ms.
- `keepaliveTimeoutMilliseconds` bounds the wait after a keepalive. The default
  is 15,000 ms.

A live renderer sends the first ack at once. A missing ack now costs 4,000 ms,
not 15,000 ms. The session write keeps its 5,000 ms bound.

This also shortens the wait before a busy renderer is closed without a prompt
and without a session snapshot. The wait falls from 15,000 ms to 4,000 ms. A
renderer that is busy for 4,000 ms to 15,000 ms could answer before the old
deadline but not the new one. That case loses the unsaved state without a
prompt. This change keeps the shorter wait because a 15,000 ms wait equals the
whole e2e budget.

The old `timeoutMilliseconds` option is replaced by
`keepaliveTimeoutMilliseconds`. No other module used it.

## What the next legs must show

- Several green full-suite runs on macOS and Windows. The flake closes only
  after that.
- On a new failure, the trace still shows `Close context` as the last action.
- The next owner must then instrument the session write and the quit. The ask
  deadline is no longer equal to the test budget.

## Validation

- `npm run typecheck` passed.
- `npm run check:deps` passed with 153 modules and 333 dependencies.
- `npm run test:unit` passed 1,184 tests in 115 files.
- `npm run check:coverage` passed every ratchet. Statements were 99.07 percent.
  Branches were 97.29 percent. Functions were 99.23 percent. Lines were 99.22
  percent.
- The affected e2e specs passed once. The run had 16 tests from
  `test/e2e/workspace-sidebar.spec.ts` and `test/e2e/tabs.spec.ts`, without
  `@AC-PERF`.
- AC-R11-02 measured 270.1 ms expand p95 against 500 ms.
- AC-R11-04 measured 58.4 ms open p95 against 100 ms.

The review lane added the default keepalive test and checked three mutations.
`npm run typecheck` passed on the merged tree. The targeted unit run passed 28
tests in `closeRequests` and `lineDiff`. `lineDiff` timed out once in the
precheck under host load and passed here.
