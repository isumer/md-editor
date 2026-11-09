# E2E flake owner - macOS open-external timeout, Pi dirty-tab close (dev lane)

Base: main

Two red lines came from outside the slice 11 candidate (a pure unwired
module). A red candidate may get a new candidate only after its flake
has an owner. This brief is that owner. Fix the flakes or report the
cause; do not make either test pass by weakening it.

## Findings

F1 (macOS, blocks candidate 246095f): in CI run 42587258868,
`test/e2e/ipc-contracts.spec.ts` case
"the open-external contract rejects a non-string URL" (@AC-SEC-08)
exceeded the 15 s test timeout on macos-latest. The other 72 e2e tests
passed. The case just before it ("an unparsable URL") took 8.1 s against
its usual 3.0 s. Main is green on the same macOS job before
(`f3070cd`, run 42578383254) and after (`d22cccf`, run 42589898270) that
candidate. The candidate's tree adds no source file that this test
imports. The same run uploaded artifact `failure-macos-latest`
(id 13660500290); it holds
`test-results/ipc-contracts-the-open-ext-9fa12-ct-rejects-a-non-string-URL/trace.zip`
and `error-context.md`.

F2 (Pi, precheck of the same candidate): in
`node scripts/run-e2e.cjs --repeat-each 3 --grep-invert @AC-PERF`,
`test/e2e/tabs.spec.ts:316` "closing a dirty tab honours Cancel, Discard
and Save" (@AC-R4-05) failed once in three runs (4.1 s). CI on ubuntu,
windows and macOS passed the same test on the same tree. Main merged
`2f3f28c` ("Prevent close races from discarding unsaved edits") today;
that change touches `src/main/app/closeRequests.ts` and
`src/renderer/tabs/documentLifecycle.ts`.

## Steps

1. **Read the trace first (F1).** Download the artifact of run
   42587258868 (`gh run download 42587258868 -R isumer/md-editor`), open
   `trace.zip` (`npx playwright show-trace`) and name the action that
   ate the 15 s: the `launchEditor` call, the `openExternal` IPC round
   trip, the `application.evaluate` patch of `shell.openExternal`, or
   `closeEditor` in the `finally` block. Quote the timestamps in your
   report.
2. **Reproduce locally.** Run each affected spec ten times on this host
   through the lock:
   `../../../mdeditor-pipeline/locked-npm exec playwright test -g "open-external contract" --repeat-each 10`
   and the same for `"closing a dirty tab"`. A red line in ten is a
   finding you must fix; a clean ten only means the trigger is not
   reproducible here.
3. **Fix the cause inside the allowed files.** Plausible causes, in
   priority order: a launch or close path that waits on a condition
   instead of returning when it is done; five serial editor launches in
   one parameterised loop that queue up on a slow runner (the five
   open-external cases are independent and could share one instance); a
   close-request settle race from `2f3f28c` between the prompt, Save and
   Discard. Any fix must keep every assertion and every acceptance tag.
4. **Stay out of these files.** `test/e2e/helpers.ts`,
   `test/e2e/editor.spec.ts` and `test/e2e/preview.spec.ts` belong to a
   queued fix item (windows-argv-open-flake). If the trace names the
   hang inside `launchEditor` or `closeEditor` in `helpers.ts`, stop and
   report the timestamps; the reviewer will hand this finding to that
   item.
5. **Prove it.** The tabs fix needs the failing path red first: break
   the close or discard settle (one line), show a red test, restore.
   Re-run step 2 after the fix. Push your branch; CI on all three OSes
   is the final gate for F1, because macOS cannot run here.

## Allowed files

`test/e2e/ipc-contracts.spec.ts`, `test/e2e/tabs.spec.ts`,
`src/main/app/closeRequests.ts`, `src/renderer/tabs/documentLifecycle.ts`,
`test/unit/closeRequests.test.ts`, `test/unit/tabsDocumentLifecycle.test.ts`,
`test/unit/tabsDocumentLifecycleSave.test.ts`. Nothing else.

## Forbidden

No timeout, budget, retry, skip or threshold change. No sleep added to
a wait. No `Protected-change` trailer. Do not widen the
`--grep-invert @AC-PERF` scope. If the cause is outside the allowed
files, report it in the commit message and stop; do not edit.
