# Windows Save dirty flake

## Result

`DocumentCommands` discarded rejected menu command promises.

The rejection produced no status message and left the document dirty.

The new unit test reproduced this mechanism deterministically.

The original test failed because `onError` received no call.

Vitest also reported an unhandled `save stopped` rejection.

The dispatcher now sends command rejections to the existing error callback.

The same unit test passes after this change.

The Windows rejection source remains unproven.

`DocumentLifecycle` catches normal save failures and shows their messages.

Therefore, this fix closes the proven silent-rejection path only.

## Candidate ranking

1. A menu command rejection best matches the dirty document and missing message.
2. An unsettled IO request also matches both symptoms, but current port-loss handling settles pending requests.
3. A dropped main-to-renderer send remains possible, but no artifact proves window loss.
4. A settled atomic-write failure is unlikely because every failure becomes a visible typed result.

The listener installs before the renderer publishes its menu contribution.

A menu rebuild does not invalidate an old item's captured send callback.

Windows rename retries wait 1,550 milliseconds before the final attempt.

A completed rename failure must reach the lifecycle status surface.

The available artifact facts show no visible status after approximately 3.3 seconds.

The menu click returned in approximately 3 milliseconds.

The disk poll found no saved text during its 2-second window.

The dirty marker existed before the click and remained during teardown.

The artifact archive could not be downloaded without authenticated access.

## Red and green proof

The focused unit run failed before the source fix.

The failure showed zero `onError` calls and one unhandled rejection.

The focused unit run passed after the source fix.

All 1,184 unit tests passed.

Line coverage was 99.22 percent.

Branch coverage was 97.29 percent.

The coverage ratchet passed.

The targeted `editor.spec.ts` run passed all 14 tests once.

AC-R5-02 passed in 1.3 seconds on Linux.

This Linux result is a regression probe only.

## Windows closure evidence

Run at least three consecutive Windows full-suite legs on the fixed revision.

Each leg must pass AC-R5-02 without retries.

Each leg must save the typed text and clear the dirty marker.

Each leg must contain no `unhandledRejection` event for a menu command.

Each leg must contain no `io-worker-exit` event during AC-R5-02.

Keep the flake open until all required Windows legs pass.
