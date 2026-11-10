review: deep

# Perf fix 9: finish fix 8 — size guard, frame-cancel test, Ubuntu scroll frame

Base: continues the PR branch `bug/perf-skip-remove-fix` at `eb7c976`.
Run `git merge origin/main` first. Keep the whole skip removal and the
frame-paced initial append of fix 8. Add no features. No new
dependencies. Commit after each item. Show a red test or a red mutation
for each behaviour change (AGENTS.md).

## State of the branch (review of job 1226, 2026-11-10)
- `eb7c976` adds `APPEND_FRAME_BLOCK_THRESHOLD = 8` in
  `src/renderer/features/preview/preview.ts`: an initial append larger
  than eight blocks waits one animation frame before its remainder
  flushes. Worker fill batches (at most eight blocks) keep the timer path.
- CI run 42738728647 on `eb7c976`: macOS AC-PERF-10 green
  (`n=0 max=0.0 ms blocks=2328`, editable 278 ms, firstPreview 428 ms).
  Windows and the Linux package job are green.
- Ubuntu is red on AC-PERF-09 "fling-scrolling the 20 MB preview":
  `frames=112 maxFrame=33.4ms frames>32ms=1`. Before fix 8, on candidate
  `a1a46a9` (run 42657632409, Ubuntu job 129354690709), the same row
  measured `maxFrame=16.8ms frames>32ms=0`. One sample each, but the
  regression lines up with the new frame pacing. Treat it as caused by
  this branch until a measurement shows otherwise.
- `eb7c976` also lowered `MARKDOWN_LANGUAGE_MAX_LENGTH` in
  `src/renderer/editor/editor.ts` from 4 MiB to 1 MiB. Fix 8 forbade
  that: a document at or below 4 MiB keeps the markdown language.
- Mutation `cancelAnimationFrame(pending.frame)` removed from the flush
  path in `preview.ts`: all 20 tests of `test/unit/preview.test.ts` stay
  green. No test covers a flush or a cancel while the frame wait is
  pending.
- Fix 8's report has no trace, no window-commit revert results and no
  three-run before/after numbers.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/editor/editor.ts`
- `test/unit/preview.test.ts`, `test/unit/editor.test.ts`
- `test/e2e/preview-perf.spec.ts`: the failure message and its
  diagnostics only. Do not change any budget, wait or assertion.
Nothing else. Do not commit a probe, a trace or a throttling script.

## Items
1. **Restore the 4 MiB cutoff.** Set `MARKDOWN_LANGUAGE_MAX_LENGTH` back
   to `4 * 1024 * 1024` with its old comment. Add the unit test
   `AC-PERF-10: keeps Markdown behavior through four MiB` in
   `test/unit/editor.test.ts`: it pins the value by literal
   (`4 * 1024 * 1024`), not by the exported constant. Show it red
   against the 1 MiB value first.
2. **Test the frame cancel.** Add a unit test in
   `test/unit/preview.test.ts`: an initial append over eight blocks
   arms the frame wait; before the frame fires, a newer response
   (or a dispose/document switch, whichever path calls the flush or
   cancel) arrives; then the frame fires. The stale remainder must not
   apply, and no second flush runs. Show it red with
   `cancelAnimationFrame(pending.frame)` removed.
3. **Fix the Ubuntu 20 MB scroll frame.** Find why AC-PERF-09 20 MB has
   a 33.4 ms frame after fix 8. Likely shape: the frame-paced remainder
   still appends while the scroll runs, so a layout lands inside a
   scroll frame. Check whether the deferred flush runs during the
   scroll, and make the append work it does fit a frame without
   bringing back the macOS open longtask. Do not tune the threshold
   only to pass one CI sample; say in the report why the chosen shape
   holds on both rows.
4. **Prove it on CI.** Push to `bug/perf-skip-remove-fix`. All four jobs
   must be green. Paste the run id. From Ubuntu and macOS, list
   AC-PERF-09 500 KB and 20 MB (`maxFrame`, `frames>32ms`), AC-PERF-10
   (`n`, `max`, `blocks`) and AC-PERF-11 (editable, firstPreview).
   macOS AC-PERF-10 `max` must be at or below 80 ms. Measurement
   pushes are allowed; write "measurement" in the commit message.
5. **Report.** Fix 8 items 1, 2 and 6 (trace, window-commit reverts,
   before/after numbers) are no longer required if item 4 is green on
   two consecutive pushes. Otherwise, do them for the failing row.

## Rules
- Every budget, wait, poll and assertion stays as it is. No skip, no
  retry, no platform exception, no threshold change in tests.
- `grep -rn MDEDITOR_SKIP_PERF` over `src`, `scripts`, `test`,
  `playwright.config.ts` and `.github` finds no hit.
- On this host the AC-PERF rows are information only.
- No test-environment branches in src. No mocks of our own modules.
- Comments stay one or two lines.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit
0. Items 1 and 2 show red-then-green runs. CI on the final commit is
green on all four jobs, with the numbers of item 4 in the report.
