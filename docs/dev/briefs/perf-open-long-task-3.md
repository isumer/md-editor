review: deep

# Perf fix 2: name the 20 MB open task, then fix it (send-back of review 953)

Base: continues the PR branch `feature/perf-open-long-task-2`. Run
`git merge origin/main` first. Keep the goals of `perf-open-long-task-2.md`.
Add no features. No new dependencies. Commit after each item. Show a red
test first where behaviour changes (AGENTS.md).

## State of the branch
- The branch adds two diagnostic marks around the preview apply and a much
  better AC-PERF-10 failure message. Keep both. They match goal 3 of the
  original brief.
- The branch also halves `FILL_BATCH_SIZE` from 8 to 4. That change is not
  proven and it doubles the 20 MB fill time. See item 1.
- The worker gave no throttled measurement. There is no before/after report.
  The original brief (goal 1 and goal 4) required both. See item 2.

## Evidence on this branch
- The fill waits for an animation frame before it asks for the next batch
  (`requestNextFill` in `preview.ts`). One batch per frame, so total fill
  time is proportional to the batch size.
- With 8 blocks per batch the AC-PERF-09 20 MB test completes its fill in
  about 4.4 minutes on this machine (comment at `preview-perf.spec.ts:425`).
  It then fails only the 32 ms frame budget (Pi information only).
- With 4 blocks per batch the fill needs about 8.8 minutes. The test's own
  360 s poll then expires. The precheck ran it 3 times: 3 failures, each at
  6.0 min (poll timeout). Job 944's run shows the same. This is caused by the
  branch, not by the machine.
- The 100 ms open task is not reproduced on this machine without throttling:
  the run prints `n=0 max=0.0 ms`.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- `src/renderer/main.ts` (only if the measurements name work there)
- `src/shared/workers/render.ts` and `test/unit/renderContracts.test.ts`
  (only if a new or changed worker message is needed)
- their existing unit tests under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message and new mark names
  only. Do not change any budget, wait or assertion.
Nothing else. Do not edit `coverage-baseline.json`, package.json, workflows,
acceptance files or the e2e assertions.

## Items

1. **Blocker - undo the unproven fill change.** Restore
   `FILL_BATCH_SIZE = 8`. The 4 value doubles the 20 MB fill and makes
   AC-PERF-09's 360 s poll time out on this machine. If you later find the
   fill apply is the largest task, make each batch cheaper without doubling
   the number of frames: for example, build the batch in a detached
   fragment, or avoid a forced layout between blocks. Do not buy a smaller
   task with a longer total fill.

2. **Blocker - reproduce and name the task.** Use a throwaway Playwright
   probe with CDP `Emulation.setCPUThrottlingRate` at 4x and 6x. Do not
   commit the probe or the throttling. Open the 20 MB fixture through the
   menu. Record the long tasks after the first editor line shows, and the
   marks `preview-apply-start`, `preview-apply-end` and the
   `preview-patch` measures near each task. Say which function or section
   makes the largest task. Give the largest task before and after at 4x and
   at 6x on the same machine.
   - If the largest task contains `preview-apply-start` and
     `preview-apply-end`, the cause is the preview apply. Split that work.
   - If it has no preview mark, the cause is editor, CodeMirror layout or
     GC work after the first paint. Name the file and line with the
     measurement that proves it.
   - If the cause is outside the allowed files, stop there, name the file
     and the line, and say what the numbers show. Do not change the file.

3. **Fix the named cause.** Split, defer or move the named work so every
   task after the first editor line stays well below 100 ms at 6x
   throttling. Keep the editor text, the first preview screen, block order
   and line numbers the same as the plain path. Add a unit test for the new
   split or deferral, tagged `AC-PERF-10`, that is red before the fix and
   green after it.

4. **Replace the constant-pinning test.** The new test `each progressive
   fill limits synchronous preview work` (`incrementalRender.test.ts`) only
   pins `FILL_BATCH_SIZE`. It proves nothing about the long task. Replace it
   with a test of the behaviour from item 3. If no worker split or deferral
   remains, remove it.

5. **Keep the diagnostics.** Keep the two marks and the AC-PERF-10 failure
   message. They let the next red CI run name the task.

## Rules
- The 100 ms budget, the 5 s window, the 360 s poll and every assertion
  stay as they are. No skip, no retry, no platform exception.
- No test-environment branches in src. No mocks of our own modules.
- Keep the macOS chords (`PRIMARY_MODIFIER`, `DOCUMENT_START`,
  `DOCUMENT_END` from `test/e2e/helpers.ts`) in any new key press.
- Comments stay one or two lines.

## Tests (criterion ids)
- AC-PERF-10: the open-task e2e message carries the largest task and the
  nearby marks. The assertion stays the same.
- AC-PERF-10: a unit test for the new split or deferral.
- AC-PERF-09: the 20 MB test must complete its fill inside the 360 s poll.
  On the Pi its 32 ms frame budget is information only.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
`npx playwright test test/e2e/preview-perf.spec.ts` is green on Linux for
everything except the information-only Pi frame budget; the 20 MB render
must complete. The report gives the largest task before and after at 4x
and 6x, and names the fixed function. List the changed files. macOS is
checked by CI.
