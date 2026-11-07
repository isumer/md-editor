review: deep

# Perf fix 3: prove the measured window, and test the deferral (send-back of review of 9d61816)

Base: continues the PR branch `feature/perf-open-long-task-2`. Run
`git merge origin/main` first. Keep the goals of `perf-open-long-task-2.md`.
Add no features. No new dependencies. Commit after each item.
Show a red test first where behaviour changes (AGENTS.md).

## State of the branch
- Items 1, 4 and 5 of `perf-open-long-task-3.md` are done. `FILL_BATCH_SIZE`
  is 8 again. The constant-pinning test is gone. The two marks and the
  AC-PERF-10 failure message are in place.
- Item 2 is incomplete. The report gives the overall largest task, but not
  the largest task with `start >= shownAt`. It names `editor.dispatch` at
  `src/renderer/main.ts:277`. That work runs before the first editor line
  shows, so the e2e's filter excludes it (`preview-perf.spec.ts:168`).
  The report never gives the task that the test measures.
- Item 3 is not proven. The report's own after numbers are 252 ms at 4x and
  297 ms at 6x. Both are above the 100 ms target. If those tasks start
  before `shownAt`, the report must say that and give the windowed numbers.
- Two load-bearing lines have no test. A mutation review of the new unit
  test found three survivors:
  - set `applyAccepted(first, false)` to `true`: all tests stay green.
  - remove `flushAppend()` from `onmessage`: all tests stay green.
  - remove the doc/epoch guard in `flushAppend`: all tests stay green.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- `src/renderer/main.ts` (only if the measured window names work there)
- `src/shared/workers/render.ts` and `test/unit/renderContracts.test.ts`
  (only if a new or changed worker message is needed)
- their existing unit tests under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message and new mark names
  only. Do not change any budget, wait or assertion.
Nothing else. Do not edit `coverage-baseline.json`, package.json, workflows,
acceptance files or the e2e assertions.

## Items

1. **Blocker - report the task inside the measured window.** Use the same
   throwaway Playwright probe with CDP `Emulation.setCPUThrottlingRate` at
   4x and 6x. Do not commit the probe or the throttling. Open the 20 MB
   fixture through the menu. Take `shownAt` exactly as the e2e does. Give
   the largest task with `start >= shownAt`, before and after the change in
   item 2, at 4x and at 6x, on the same machine. For the largest windowed
   task, list the `preview-apply-start`, `preview-apply-end` and
   `preview-patch` marks near it. State whether the largest task overall
   starts before or after `shownAt`.
   - If the largest windowed task is 100 ms or more at 6x, fix the named
     cause. Name the function or section and the file and line.
   - If the largest windowed task is below 100 ms at 6x, say so with the
     numbers. Then no source change is needed for this item.

2. **Fix the named windowed cause if item 1 names one.** Split, defer or
   move that work so every task with `start >= shownAt` stays well below
   100 ms at 6x. Keep the editor text, the first preview screen, block
   order and line numbers the same as the plain path.

3. **Test the deferral's ordering and guards.** Add these tests to
   `test/unit/preview.test.ts`. Every title starts
   `AC-PERF-10:`. Use exact expected values.
   - `requests one fill after a split append` - send an 8-block append,
     run the pending timers, run every queued frame, then assert
     `worker.postMessage` was called exactly once with the `fill-ready`
     message. This kills `applyAccepted(first, true)`.
   - `applies a newer result after the deferred part` - send an 8-block
     append for version 1. Do not run its timer. Then send a second
     append for version 2 with one block. Assert the block ids in DOM
     order are `b0` to `b8`. Without the `flushAppend()` call at the top
     of `onmessage`, `b8` lands before `b4` to `b7`. Make
     `currentVersion()` return a mutable version object so version 2 is
     accepted.
   - `drops a pending append when the document changes` - send an
     8-block append. Change the live doc id (or epoch). Run the timers.
     Assert the preview holds the first four blocks only and no
     `fill-ready` was posted.
   - `applies a batch of four blocks in one task` - send exactly four
     blocks. Assert 4 blocks are shown, only one frame callback is
     queued, and no timer is pending. This pins the `>` boundary.
   Red evidence: apply each mutation, show the matching test red, restore
   the line. Paste all four runs:
   - `applyAccepted(first, false)` to `true`.
   - remove `flushAppend()` from `onmessage`.
   - remove the doc/epoch guard in `flushAppend`.
   - `blocks.length > APPEND_TASK_BLOCK_LIMIT` to `>=`.

4. **Keep the diagnostics and the scope.** Keep the two marks, the
   AC-PERF-10 failure message, `FILL_BATCH_SIZE = 8` and the 4-block
   split. Do not add a new constant, message or file.

## Rules
- The 100 ms budget, the 5 s window, the 360 s poll and every assertion
  stay as they are. No skip, no retry, no platform exception.
- No test-environment branches in src. No mocks of our own modules.
- Keep the macOS chords (`PRIMARY_MODIFIER`, `DOCUMENT_START`,
  `DOCUMENT_END` from `test/e2e/helpers.ts`) in any new key press.
- Comments stay one or two lines.

## Tests (criterion ids)
- AC-PERF-10: the open-task e2e reports the largest windowed task and the
  nearby marks. The assertion stays the same.
- AC-PERF-10: four unit tests for the split, its order and its guards.
- AC-PERF-09: the 20 MB test must complete its fill inside the 360 s poll.
  On the Pi its 32 ms frame budget is information only.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
`npx playwright test test/e2e/preview-perf.spec.ts` is green on Linux for
everything except the information-only Pi frame budget; the 20 MB render
must complete. The report gives the largest task with `start >= shownAt`
before and after at 4x and at 6x, names the fixed function if the number is
100 ms or more, and pastes the four red runs. List the changed files.
macOS is checked by CI.
