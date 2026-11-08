review: deep

# Perf fix 4: keep the branch shippable and remove the windowed task

Base: continues the PR branch `feature/perf-open-long-task-2` at `90175cd`.
Run `git merge origin/main` first. Keep the goals of
`perf-open-long-task-2.md`. Add no features. No new dependencies. Commit
after each item. Show a red test first where behaviour changes (AGENTS.md).

## State of the branch
- Commit `9d61816` added the 4-block append deferral. Its four tests passed.
- Commit `90175cd` removed the deferral to measure a "before" build. The tree
  stayed in that measurement state, and the pipeline committed it.
- `npm run verify` is red: `test/unit/preview.test.ts:161`
  "AC-PERF-10: drops a pending append when the document changes" sees all
  eight blocks, not the first four. Two of the other new AC-PERF-10 tests
  pass only because the split is absent, so they currently guard nothing.
- Commit `90175cd` committed `test/e2e/perf-window-probe.spec.ts`. The
  previous brief forbids committing the probe. Delete it.
- No report was written. `reports/980-perf-open-long-task-4/` is empty.
- Measured with the deferral at 6x: the largest task with `start >= shownAt`
  is 111 ms and 123 ms in two runs. The largest task overall (978 ms) starts
  before `shownAt`. The windowed task starts after `preview-apply-end`
  (2317.8 ms / 2323.6 ms) and before the next `preview-apply-start`
  (2477.1 ms / 2501 ms). The cause is not named and not fixed.

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
- `test/e2e/preview-perf.spec.ts`: the failure message and mark names only.
  Do not change any budget, wait or assertion.
- `test/e2e/perf-window-probe.spec.ts`: delete it. Do not add it back.
Nothing else. Do not edit `coverage-baseline.json`, package.json, workflows,
acceptance files or the e2e assertions.

## Items

1. **Restore the shipping state.** Put back the `preview.ts` change of
   commit `9d61816`: `APPEND_TASK_BLOCK_LIMIT`, `pendingAppend`,
   `applyAccepted`, `flushAppend`, and its use in `onmessage`. Do not remove
   the four AC-PERF-10 tests. Delete
   `test/e2e/perf-window-probe.spec.ts` with `git rm`. Do not commit a
   measurement build. Every commit must be the full shipping state.
   Run `npm run test:unit` and show the four tests green.

2. **Name and fix the windowed task.** Reproduce the 111 ms to 123 ms task
   at 6x with the deferral present. Use CDP
   `Emulation.setCPUThrottlingRate` and a throwaway probe or trace. Name the
   function or section and its file and line. Give the trace evidence.
   Then fix that work so every task with `start >= shownAt` stays below
   100 ms at 6x. Keep the editor text, the first preview screen, block order
   and line numbers the same as the plain path.
   - If the named cause is outside the allowed files, stop and report the
     trace and the location. Do not edit outside the list.

3. **Report the numbers.** Give the largest task with `start >= shownAt`
   before and after the item-2 change, at 4x and at 6x, three runs each on
   the same machine. Give the largest task overall and say whether it starts
   before or after `shownAt`. For the largest windowed task, list the
   `preview-apply-start`, `preview-apply-end` and `preview-patch` marks near
   it. The probe and the throttling stay throwaway: do not commit them.

4. **Prove the four guards.** The tests are already on the branch. Apply
   each mutation separately, show the matching test red, then restore the
   line. Paste all four runs in the report:
   - `applyAccepted(first, false)` to `true`.
   - remove `flushAppend()` from `onmessage`.
   - remove the doc/epoch guard in `flushAppend`.
   - `blocks.length > APPEND_TASK_BLOCK_LIMIT` to `>=`.

5. **Keep the diagnostics and the scope.** Keep the two marks, the
   AC-PERF-10 failure message, `FILL_BATCH_SIZE = 8` and the 4-block split.
   Do not add a new constant, message or file.

## Rules
- The 100 ms budget, the 5 s window, the 360 s poll and every assertion
  stay as they are. No skip, no retry, no platform exception.
- No test-environment branches in src. No mocks of our own modules.
- Keep the macOS chords (`PRIMARY_MODIFIER`, `DOCUMENT_START`,
  `DOCUMENT_END` from `test/e2e/helpers.ts`) in any new key press.
- Comments stay one or two lines.
- Run `npm run verify` on the committed tree. A green measurement build is
  not a deliverable; the committed tree must be the tree you verified.

## Tests (criterion ids)
- AC-PERF-10: the open-task e2e reports the largest windowed task and the
  nearby marks. The assertion stays the same.
- AC-PERF-10: four unit tests for the split, its order and its guards. Each
  must go red under its own mutation.
- AC-PERF-09: the 20 MB test must complete its fill inside the 360 s poll.
  On the Pi its 32 ms frame budget is information only.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
`npx playwright test test/e2e/preview-perf.spec.ts` is green on Linux for
everything except the information-only Pi frame budget; the 20 MB render
must complete. The probe file is deleted. The report gives the largest task
with `start >= shownAt` at 4x and 6x before and after, names the fixed
function and its file and line if the number was 100 ms or more, and pastes
the four red mutation runs. List the changed files. macOS is checked by CI.
