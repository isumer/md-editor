review: deep

# Perf fix 9-1: drop the dead parse wrapper, bound the message drain, prove macOS AC-PERF-11

Base: continues the PR branch `bug/perf-skip-remove-fix` at `746c9c4`.
Run `git merge origin/main` first. Keep the whole skip removal, the
frame-paced initial append and the four MiB cutoff. Add no features.
No new dependencies. Commit after each item. Show a red test or a red
mutation for each behaviour change (AGENTS.md).

## State of the branch (review of job 1229, 2026-11-10)
- `746c9c4` adds a Markdown `wrap` extension at
  `src/renderer/editor/editor.ts:95-133` and changes line 175 to use
  it. No test covers it. It only runs for documents at or below the
  4 MiB cutoff, so it cannot affect AC-PERF-09/10/11, whose fixtures
  are 20 MB and skip the language entirely. It fabricates a Tree with
  one paragraph node and a `chunk(0)` scan of the whole document on
  every parse of a text over 64 KiB, so it changes editor behaviour
  for large plain-text documents and adds a synchronous full-text
  regex scan for no measured gain.
- `8632026` puts `while (pendingAppend !== null) flushAppend();` at
  the top of `renderWorker.onmessage`
  (`src/renderer/features/preview/preview.ts:384-386`). `flushAppend`
  slices four blocks and re-defers the remainder, so the loop applies
  the whole pending remainder in one task whenever any worker message
  arrives. That defeats the frame pacing the same commit adds, and no
  test covers it. `applyAccepted` returning false exits the loop only
  by leaving `pendingAppend` null.
- CI run 42763441227 on `746c9c4`: Ubuntu AC-PERF-09 20 MB is now
  green (`maxFrame=16.8ms frames>32ms=0`, was 33.4 ms on `eb7c976`),
  Windows AC-PERF-11 is 239/383 ms, Ubuntu 380/615 ms, and all four
  AC-PERF-10 rows are `n=0 max=0.0`. The macOS job is red:
  `AC-PERF-11 20MB open: editable=808ms firstPreview=1043ms` against
  `expect(previewAfter).toBeLessThan(1_000)`; the same row was
  278/428 ms on `eb7c976` (run 42738728647). Editable and firstPreview
  grew together, and the editor open path is untouched by this
  branch, so runner variance is possible. It is not proven, and the
  row is the gate.
- Three mutation checks in the review went red and were restored:
  `APPEND_FRAME_BLOCK_THRESHOLD` 8 to 7; removing
  `cancelAnimationFrame(pending.frame)`; `MARKDOWN_LANGUAGE_MAX_LENGTH`
  back to 1 MiB.

## Items
1. **Drop the parse wrapper.** Remove the `wrap` extension and the
   `plainMarkdown*` / `MarkdownTree` / `markdownSupport` block from
   `src/renderer/editor/editor.ts`. Restore `markdown()` at line 175
   and keep `MARKDOWN_LANGUAGE_MAX_LENGTH = 4 * 1024 * 1024` with its
   comment and its unit test. Do not change any other editor
   behaviour. If you believe some form of the wrapper is needed, do
   not keep it here: reply with the measurement that needs it and a
   test that pins the parsed tree, because the perf rows cannot be
   that measurement.
2. **Bound the message drain.** On a worker message the preview must
   apply at most `APPEND_TASK_BLOCK_LIMIT` blocks from a pending
   append, then leave the rest pending and keep its frame or timer.
   Keep the block order and the existing fill request. Add a unit test
   in `test/unit/preview.test.ts`: arm a pending initial append of
   more than eight blocks, deliver another worker message before the
   frame fires, and assert only the first four blocks are in the
   preview, the remainder is still pending, and no block is lost or
   shown twice. Show it red against the current loop.
3. **Prove macOS AC-PERF-11.** After item 1, push a measurement
   commit and read macOS
   `AC-PERF-11 20MB open: editable=… firstPreview=…`. If it is green,
   push a second measurement and take item 4. If it is red again,
   locate the delay rather than tuning the test: record whether the
   first append chunk (which holds the h1) is applied before any
   animation frame, whether a `requestAnimationFrame` wait is
   throttled on the macOS runner, and where the time between the
   editor becoming editable and the h1 appearing goes. Fix what the
   evidence shows, keep Ubuntu AC-PERF-09 20 MB at or below 16.8 ms
   and keep the macOS AC-PERF-10 open row at or below 80 ms.
4. **Prove it on CI.** Two consecutive pushes on
   `bug/perf-skip-remove-fix` with all four jobs green. Paste both run
   ids. From Ubuntu and macOS list AC-PERF-09 500 KB and 20 MB
   (`maxFrame`, `frames>32ms`), AC-PERF-10 (`n`, `max`, `blocks`) and
   AC-PERF-11 (editable, firstPreview). Measurement pushes are
   allowed; write "measurement" in the commit message.
5. **Report.** Fix 8 items 1, 2 and 6 stay waived only while item 4 is
   green on two consecutive pushes. Otherwise do them for the failing
   row.

## Rules
- Every budget, wait, poll and assertion stays as it is. No skip, no
  retry, no platform exception, no threshold change in tests.
- `grep -rn MDEDITOR_SKIP_PERF` over `src`, `scripts`, `test`,
  `playwright.config.ts` and `.github` finds no hit.
- On this host the AC-PERF rows are information only.
- No test-environment branches in src. No mocks of our own modules.
- Comments stay one or two lines.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/editor/editor.ts`
- `test/unit/preview.test.ts`, `test/unit/editor.test.ts`
- `test/e2e/preview-perf.spec.ts`: the failure message and its
  diagnostics only. Do not change any budget, wait or assertion.
Nothing else. Do not commit a probe, a trace or a throttling script.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit
0. Item 2 shows a red-then-green run. CI on the final commit is green
on all four jobs, with the numbers of item 4 in the report.
