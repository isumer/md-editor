review: deep

# Perf fix 6: remove the traced parse slice above a size threshold

Base: continues the PR branch `feature/perf-open-long-task-6` at `16ca412`.
Run `git merge origin/main` first. Keep the goals of
`perf-open-long-task-6.md`. Add no features. No new dependencies. Commit
after each item. Show a red test first where behaviour changes (AGENTS.md).

## State of the branch
- `40f2dec` bounds the apply marks (`performance.clearMarks` before each
  new `preview-apply-start` / `preview-apply-end` pair) and adds the two
  marker unit tests. That work is correct and proven: four separate
  mutations each turned the matching test red. Keep it. Do not undo it.
- `16ca412` reverts `697e8d3`, an unrelated completion-write
  optimisation. `16ca412` is the tree under review.
- `perf-open-long-task-6.md` item 1 named the cause. The windowed task is
  `ParseWorker.work` in `@codemirror/language` (dependency, so outside
  that brief's allowed files). Trace at 6x: `RunTask` 103.310 ms,
  `FireIdleCallback` 102.982 ms, `FunctionCall work` 101.838 ms, task
  start 4907.4 ms, `preview-apply-end` at 4907.3, next
  `preview-apply-start` at 5018.0. No `preview-patch` mark nearby. The
  library hardcodes a 100 ms work slice
  (`@codemirror/language/dist/index.js`, `Work.Slice = 100`) and runs it
  from an idle callback, so one slice plus idle overhead exceeds the
  100 ms budget with no work of ours inside it. CI run 42493094245 fails
  macOS `Test (macos-latest)` with the same 102.0 ms task.
- The editor attaches the markdown language support unconditionally
  (`src/renderer/editor/editor.ts:109`, `markdown()` from
  `@codemirror/lang-markdown`). Every opened document, including 20 MB,
  gets a CodeMirror parser that runs those slices. That is the fix site.
- The Pi rows (AC-PERF-09 33.3 ms scroll frame, AC-PERF-11 1,142 ms
  first preview) are information only on this host. Do not tune code or
  thresholds to them. CI on the three operating systems is the gate.

## Allowed files
- `src/renderer/editor/editor.ts`
- `src/renderer/main.ts` (only if the threshold check needs the size
  there)
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- `src/shared/workers/render.ts` and `test/unit/renderContracts.test.ts`
  (only if a new or changed worker message is needed)
- `test/unit/editor.test.ts` (new file; the editor has no unit test yet)
- their existing unit tests under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message and the mark names
  only. Do not change any budget, wait or assertion.
- `CHANGELOG.md`: exactly one line under `[Unreleased]` -> `Changed`,
  because a 20 MB document loses editor syntax highlighting and folding.
  Do not remove the existing preview line.
Nothing else. Do not commit a probe, a trace or a throttling script.

## Items

1. **Omit the language support above a size threshold.** In
   `createEditorState`, attach `markdown()` only when the document length
   is at or below a single named constant in `editor.ts`. Above it,
   attach no language (an empty extension list is fine). Choose the value
   between 1 MiB and 8 MiB with headroom on both sides; state it and the
   reason in a one-line comment. The 500 KB fixture must stay below it;
   the 20 MB document must be above it. Keep the rest of `editorSetup`,
   line wrapping, the update listener and the existing callbacks
   unchanged. Keep the editor text, the first preview screen, the block
   order, the line numbers and the 4-block split unchanged.
   The user-visible effect is that a document above the threshold has no
   syntax highlighting, no bracket matching, no indentation on input and
   no fold markers in the editor. Say so in one CHANGELOG line. Do not
   add a setting, a toggle or a new message.

2. **Test it red first.** Add `test/unit/editor.test.ts`. Use the
   `language` facet from `@codemirror/language` to assert that a small
   document has the markdown language and a document one character over
   the threshold has none. Also assert the boundary itself: a document
   exactly at the threshold has the language. Run each test against the
   unchanged `editor.ts` first and record the red output. Two mutations
   must each go red: remove the threshold condition, and change `<=` to
   `<`. Do not mock our own modules; the facet is the real one.

3. **Prove the task is gone.** Measure the shipping tree at 4x and 6x
   with `Emulation.setCPUThrottlingRate`. The largest task with
   `start >= shownAt` must stay below 100 ms. Record the nearby
   `preview-apply-start`, `preview-apply-end` and `preview-patch` marks
   and the largest task overall, saying whether it starts before or after
   `shownAt`. The probe and the throttling stay throwaway: do not commit
   them.

4. **Report the numbers.** Same machine, three runs each, before and
   after the item-1 change: the largest task with `start >= shownAt` at
   4x and at 6x, and the largest task overall. The before rows are the
   reverted candidate: 4x windowed 183, 164, 153 ms; 6x windowed 102,
   102, 103 ms; every largest overall task started before `shownAt`.
   Also record the Pi rows for AC-PERF-09 (both) and AC-PERF-11, before
   and after; do not tune to them.

5. **Prove the guards.** Apply each mutation separately, show the
   matching test red, then restore the line. Paste all eight runs in the
   report:
   - the two new ones from item 2 (remove the condition; `<=` to `<`).
   - `applyAccepted(first, false)` to `true`.
   - remove `flushAppend()` from `onmessage`.
   - remove the doc/epoch guard in `flushAppend`.
   - `blocks.length > APPEND_TASK_BLOCK_LIMIT` to `>=`.
   - rename one marker name in `preview.ts` only.
   - remove the `clearMarks` call.

6. **Prove it on CI.** Push the candidate to
   `feature/perf-open-long-task-6`. The run's `Test (macos-latest)` e2e
   must show AC-PERF-10 green; paste the run and job ids in the report.
   Keep `Test (windows-latest)`, `Test (ubuntu-latest)` and the Linux
   package job green too. The last report pushed nothing, so no CI proof
   exists for `16ca412`; that gap is the main reason this brief exists.

If the named cause turns out to be something else in an allowed file,
fix that instead and say so with trace evidence. If it is outside the
allowed files, stop and report the trace and the location. Do not edit
outside the list.

## Rules
- The 100 ms task budget, the 32 ms frame budget, the 1,000 ms
  first-screen budget, the 5 s window, the 360 s poll and every assertion
  stay as they are. No skip, no retry, no platform exception, no
  threshold change.
- Do not change how a document below the threshold behaves. AC-R12-02
  (language selection) is still planned, so no implemented criterion
  breaks, but the CHANGELOG line is required.
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
- AC-PERF-10: three new unit tests for the threshold, each red under its
  own mutation, plus the four split tests and the two marker tests.
- AC-PERF-09: the 20 MB test completes its fill inside the 360 s poll. On
  the Pi its 32 ms frame budget is information only.
- AC-PERF-11: the 20 MB first screen stays inside 1,000 ms on CI; on the
  Pi record the number.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
`npx playwright test test/e2e/preview-perf.spec.ts` is green on Linux for
everything except the information-only Pi frame and first-screen rows;
the 20 MB render must complete. The pushed candidate shows AC-PERF-10
green on the macOS CI job. The report names the threshold, its value and
its file and line, gives the largest task with `start >= shownAt` at 4x
and 6x before and after, lists the nearby marks, pastes the eight red
mutation runs, records the Pi rows, and lists the changed files.
