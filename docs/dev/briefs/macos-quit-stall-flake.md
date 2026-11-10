review: deep

# macOS e2e: the app never exits when a test closes it

Base: main. Branch `bug/macos-quit-stall-flake` (from main). No new
features, no new dependencies. Follow AGENTS.md. Commit after each
finding.

Parts: one flake fix. Depends on: nothing. It owns the files under
"Allowed files".

## Evidence (CI, macOS only, 2026-11-10)
- Candidate da939e9 (`feature/slice10-compare-view`), run
  42753031895, job macos-latest:
  `test/e2e/ipc-contracts.spec.ts:311` "the file-save contract rejects
  a released grant" @AC-SEC-09 failed with "Test timeout of 15000ms
  exceeded." 1 failed / 42 passed. ubuntu and windows passed.
- The Playwright trace of the failed test shows every assertion of the
  test passing in about 1.7 s. The last action, "Close context", never
  finished. It is `application.close()` at `test/e2e/helpers.ts:186`
  inside `closeEditor`, called from `ipc-contracts.spec.ts:350`.
- The window closed; `application.close()` resolves only when the
  process exits, so the main process stayed alive past the 15 s test
  timeout. Nothing else ran in the window at that moment.
- The candidate touches no `src/main` file and no test-harness file.
  The same tree (one CHANGELOG line apart) was fully green on all three
  OSes 30 minutes earlier (run 42750000604). main is green. So the
  stall is outside that branch, and this brief owns it.

## Cause
Unknown; diagnose before fixing. The promise from
`application.close()` resolves on process exit. On darwin the quit
path runs: the last window closes, `window-all-closed` (or the app's
own quit rule) asks the app to quit, `before-quit` and `will-quit`
handlers run, background processes are shut down. Any handler that
awaits something which never settles holds the process open. Suspects,
in order: a quit handler that awaits an unfinished flush (draft save,
session save); a background-process shutdown that never acks on
darwin; a second window or dialog still open, because macOS keeps the
app alive after the last visible window. Do not guess: read every
listener of `window-all-closed`, `before-quit` and `will-quit` in
`src/main`, and every await behind them, and name the line that can
wait forever.

## What
- Audit the quit path first. List each handler and each await, and
  write down whether it can stay pending. If you cannot prove a bound
  on darwin, make it bounded: an await that may only delay the exit by
  a stated, short time.
- Fix the root cause in `src/main`. Product rules do not change: an
  unsaved document still asks before quitting (Cancel, Discard or
  Save), and drafts are still flushed.
- If the audit proves every product await is bounded, change the
  harness instead, as the last resort: in `closeEditor`, bound the
  wait on `application.close()`, and on timeout take the process (kill
  it, then `waitForProcessExit`) so the teardown finishes. Say in the
  report that this is a bandage and name the await you could not
  prove bounded.
- Do not raise any timeout, do not skip, retry or reorder tests, do
  not touch `playwright.config.ts`, and do not change any spec other
  than `ipc-contracts.spec.ts` if — and only if — the test itself
  leaves a window or dialog open.
- Probe with
  `npx playwright test test/e2e/ipc-contracts.spec.ts test/e2e/editor.spec.ts --repeat-each 10`
  on Linux; all runs must pass. The stall is macOS-only, so Linux
  cannot prove the fix: CI on macos-latest is the proof. A test that
  fails once in ten CI runs of this or another branch is not fixed.
- If the fix needs code outside "Allowed files", stop and report the
  file and line with what you found.

## Allowed files
`src/main/**`, `test/e2e/helpers.ts`, and the unit tests of whatever
`src/main` module you change. Nothing else.

## Checks before you finish
`npm run typecheck`, `npm run test:unit`, and the e2e command above on
Linux. Record the quit-path audit (each handler, each await, its
bound) in the report. CI on macos-latest is the final proof.
