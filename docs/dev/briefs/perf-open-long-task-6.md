review: deep

# Perf fix 5: make macOS AC-PERF-10 green again and bound the new marks

Base: continues the PR branch `feature/perf-open-long-task-2` at `be20adc`.
Run `git merge origin/main` first. Keep the goals of
`perf-open-long-task-2.md`. Add no features. No new dependencies. Commit
after each item. Show a red test first where behaviour changes (AGENTS.md).

## State of the branch
- `be20adc` restored the 4-block deferral (`APPEND_TASK_BLOCK_LIMIT`,
  `pendingAppend`, `applyAccepted`, `flushAppend`), deleted
  `test/e2e/perf-window-probe.spec.ts`, and added the open-task
  diagnostics: the `preview-apply-start` / `preview-apply-end` marks and
  the larger failure message. The four AC-PERF-10 guard tests pass. Keep
  all of that.
- The candidate turns macOS AC-PERF-10 from green into red. Main at
  `22ec737` passes `Test (macos-latest)` (run 42474398163). Candidate run
  42493094245 fails: "AC-PERF-10 open task failed. largest=start 845.7 ms
  duration 102.0 ms". The new marks localise the task: it starts just
  after `preview-apply-end@845.6` and ends before the next
  `preview-apply-start@947.9`. This is the task that
  `perf-open-long-task-5.md` item 2 asked to name and fix. It is still
  unnamed and unfixed.
- The pipeline verify of `be20adc` on the Pi failed on the two AC-PERF-09
  scroll tests (one 33.3 ms frame against the 32 ms budget) and on
  AC-PERF-11 (first preview 1,142 ms against 1,000 ms). Those are Pi
  rows; on this host they are information only. Do not tune code or
  thresholds to them. CI on the three operating systems is the product
  gate.
- The gate report also flagged the marks: every split apply adds two
  marks and the code never clears them, so one 20 MB fill can retain tens
  of thousands of marks. Renaming one marker name kept all 16 unit tests
  green. Item 2 fixes both facts.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- `src/renderer/main.ts` (only if the measurement names work there)
- `src/shared/workers/render.ts` and `test/unit/renderContracts.test.ts`
  (only if a new or changed worker message is needed)
- their existing unit tests under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message and the mark names
  only. Do not change any budget, wait or assertion.
Nothing else. Do not commit a probe, a trace or a throttling script. Do
not edit `CHANGELOG.md`: the branch carries its line from the candidate
review and that line stays.

## Items

1. **Name the windowed task.** Measure the shipping state (deferral and
   marks present) at 6x with `Emulation.setCPUThrottlingRate`. Find the
   task that breaks 100 ms; it was 111 ms and 123 ms in the last two
   measured runs and CI shows 102.0 ms unthrottled. The marks place it
   after `preview-apply-end` and before the next `preview-apply-start`.
   Name the function or section and give its file and line, with trace
   evidence. Measure before you change anything. Useful suspects: the
   `setTimeout(flushAppend, 0)` round trip and the extra work each split
   half adds, the style and layout work after the patch, and the e2e
   probe's own mark callbacks. If the named cause is outside the allowed
   files, stop and report the trace and the location. Do not edit outside
   the list.

2. **Bound the marks.** In `applyAccepted`, clear the previous
   `preview-apply-start` and `preview-apply-end` with
   `performance.clearMarks` before marking each new pair. The e2e
   diagnostics keep working: the probe collects marks in its own
   `PerformanceObserver` list, and `clearMarks` does not remove entries
   the observer already delivered. Keep the two names, or rename them in
   `preview.ts` and in `test/e2e/preview-perf.spec.ts` together. Add
   unit tests in `test/unit/preview.test.ts`: one that goes red when a
   marker name changes, one that goes red when the clear is removed. A
   spy on `performance.mark` and `performance.clearMarks` is a platform
   spy, not a mock of our own modules.

3. **Fix the task you named in item 1** so every task with
   `start >= shownAt` stays below 100 ms. Keep the editor text, the first
   preview screen, the block order and the line numbers the same as the
   plain path. Keep the two marks, the AC-PERF-10 failure message,
   `FILL_BATCH_SIZE = 8` and the 4-block split. Do not add a new
   constant, message or file. Change no budget, wait, timeout, retry or
   skip in any test.

4. **Report the numbers.** Same machine, three runs each: the largest
   task with `start >= shownAt` at 4x and at 6x, before and after the
   item-3 change. Give the largest task overall and say whether it starts
   before or after `shownAt`. For the largest windowed task, list the
   `preview-apply-start`, `preview-apply-end` and `preview-patch` marks
   near it. Also record the Pi numbers for the two AC-PERF-09 scroll
   tests and for AC-PERF-11, before and after; do not tune to them. The
   probe and the throttling stay throwaway: do not commit them. The last
   report promised these numbers and did not contain them.

5. **Prove the guards.** Apply each mutation separately, show the
   matching test red, then restore the line. Paste all six runs in the
   report:
   - `applyAccepted(first, false)` to `true`.
   - remove `flushAppend()` from `onmessage`.
   - remove the doc/epoch guard in `flushAppend`.
   - `blocks.length > APPEND_TASK_BLOCK_LIMIT` to `>=`.
   - rename one marker name in `preview.ts` only.
   - remove the `clearMarks` call.

6. **Prove it on CI.** Push the candidate to
   `feature/perf-open-long-task-2`. The run's `Test (macos-latest)` e2e
   must show AC-PERF-10 green; paste the run and job ids in the report.
   Keep `Test (windows-latest)`, `Test (ubuntu-latest)` and the Linux
   package job green too.

## Rules
- The 100 ms task budget, the 32 ms frame budget, the 1,000 ms
  first-screen budget, the 5 s window, the 360 s poll and every assertion
  stay as they are. No skip, no retry, no platform exception, no
  threshold change.
- On the Pi the AC-PERF-09/10/11 rows are information only: run them
  once, record the numbers, move on. A red Pi row is not fixed by
  changing a test.
- No test-environment branches in src. No mocks of our own modules.
- Keep the macOS chords (`PRIMARY_MODIFIER`, `DOCUMENT_START`,
  `DOCUMENT_END` from `test/e2e/helpers.ts`) in any new key press.
- Comments stay one or two lines.
- Every commit must be the full shipping state. Run `npm run verify` on
  the committed tree: everything except the information-only Pi perf rows
  must be green, with zero retries. A green measurement build is not a
  deliverable; the committed tree must be the tree you verified.

## Tests (criterion ids)
- AC-PERF-10: green on CI on macOS, Windows and Ubuntu for
  `test/e2e/preview-perf.spec.ts`, the open-task test included. The
  assertion stays the same.
- AC-PERF-10: four unit tests for the split, its order and its guards,
  plus the two new marker tests. Each goes red under its own mutation.
- AC-PERF-09: the 20 MB test completes its fill inside the 360 s poll. On
  the Pi its 32 ms frame budget is information only.
- AC-PERF-11: the 20 MB first screen stays inside 1,000 ms on CI; on the
  Pi record the number.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
`npx playwright test test/e2e/preview-perf.spec.ts` is green on Linux for
everything except the information-only Pi frame and first-screen rows;
the 20 MB render must complete. The pushed candidate shows AC-PERF-10
green on the macOS CI job. The report names the fixed function and its
file and line, gives the largest task with `start >= shownAt` at 4x and
6x before and after, lists the nearby marks, pastes the six red mutation
runs, records the Pi rows, and lists the changed files.
