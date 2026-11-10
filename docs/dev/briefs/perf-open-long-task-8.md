review: deep

# Perf fix 8: remove the macOS open longtask that the CI skip hid

Base: continues the PR branch `bug/perf-skip-remove-fix` at `a1a46a9`.
Run `git merge origin/main` first. Keep the whole skip removal of that
branch. Add no features. No new dependencies. Commit after each item.
Show a red test or a red mutation for each behaviour change (AGENTS.md).

## State of the branch
- The branch removes the temporary AC-PERF CI skip in six files. That
  work is reviewed and correct: the merge into main was clean, the
  typecheck was green, and three mutations went red (the `grepInvert`
  line restored; the `perfSkipped` branch restored; the exemption moved
  into the `required` line). Keep every part of it. Do not add a skip,
  a filter or an exemption again.
- The branch changes no runtime code: `a1a46a9` carries the tree of
  `a4c35c5`.
- CI run 42657632409 on candidate `a1a46a9` is red on macOS only.
  AC-PERF-10 reports one open longtask of 107.0 ms against the 100 ms
  budget: `n=1 max=107.0 ms blocks=2100 largest=start 1116.6 ms
  duration 107.0 ms`. Ubuntu, Windows and the Linux package job are
  green.
- The task holds no apply marks. It starts at 1116.6 ms, 8 ms after
  `preview-apply-end` at 1108.2, runs to 1223.6, and the next
  `preview-apply-start` is at 1242.4. So no `applyAccepted` call runs
  inside it. The cost is between two applies: layout, paint, garbage
  collection, or a task a dependency schedules.
- The last no-skip macOS run on main is run 42535486336 at `9b06eea`
  (2026-11-08): `n=1 max=79.0 ms blocks=2364`, editable 345 ms,
  firstPreview 537 ms — green. Every main run after it skipped
  `@AC-PERF`. The perf-open-long-task series landed inside that dark
  window: `3090178` (8-block fill batches), `9d61816` (deferred
  append), `40f2dec` (bounded apply marks) and `dccee2b` (no markdown
  language above 4 MiB). None of it was measured on macOS CI.
- The parse-slice cause of perf fix 7 is gone. The 20 MB document gets
  no language (`MARKDOWN_LANGUAGE_MAX_LENGTH`,
  `src/renderer/editor/editor.ts`), and no other code attaches one.
- The whole open path also slowed: editable 345 to 678 ms, firstPreview
  537 to 844 ms. Both stay inside the 1,000 ms budget of AC-PERF-11.
  macOS runners vary: main at `cc89512` measured `n=0 max=0.0 ms`.
  Treat each number as one sample, not as truth.
- On this host the AC-PERF rows are information only (standing platform
  rule, `docs/acceptance/PERF-response-time.md`). CI on the three
  operating systems is the gate.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- `src/renderer/workers/render/render.ts`
- `src/renderer/editor/editor.ts`
- `src/renderer/main.ts` (only if the open path needs it)
- `src/shared/workers/render.ts` and `test/unit/renderContracts.test.ts`
  (only if a worker message changes)
- the existing unit tests of the files above, under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message and its
  diagnostics only. Do not change any budget, wait or assertion.
- `CHANGELOG.md`: one line under `[Unreleased]` -> `Changed`, only if a
  user-visible behaviour changes.
Nothing else. Do not commit a probe, a trace or a throttling script.

## Items

1. **Trace the task.** Build the 20 MB open probe that perf fix 7 used
   (throwaway; do not commit it). Run the open test at 4x and 6x CPU
   throttling. Record the largest task with `start >= shownAt`, its
   attribution (script, layout, paint, garbage collection) and its
   source module. Trace main at `9b06eea` the same way, for the before
   picture. Name the module or the rendering step that owns the largest
   task.

2. **Name the window commit.** On top of the branch, revert one window
   commit at a time (`3090178`, `9d61816`, `40f2dec`, `dccee2b`).
   Throwaway reverts: do not commit or push them. Re-measure the largest
   task after each. Report which revert removes the task at or above
   100 ms. If no local run shows such a task, even at 6x, say so and
   let the CI pushes of item 5 decide.

3. **Fix the cause.** If the trace names our code, fix it inside the
   allowed files. Check one likely shape first: `APPEND_TASK_BLOCK_LIMIT`
   bounds the block count per task, not the bytes; block size varies,
   and the same 20 MB document changed from 2364 blocks to 2100 blocks
   inside the window. Bound the applied work by size, or split the
   first layout of applied content. Do not force this shape; the trace
   decides. A revert of one window commit is a valid fix when the
   measurements name it; say why in the report. If the trace names a
   dependency outside the allowed files, stop and report the trace and
   the location. Do not edit outside the list.

4. **Prove the guards.** Any behaviour change gets its red test first.
   Then mutate each new or changed guard, one at a time, and show the
   matching test red. Restore every mutant. Paste the runs in the
   report.

5. **Prove it on CI.** Push the candidate to `bug/perf-skip-remove-fix`.
   The macOS job must show AC-PERF-10 green; paste the run and job ids
   in the report. Windows, Ubuntu and the Linux package job stay green
   too. The report lists the macOS `n`, `max`, `blocks`, editable and
   firstPreview. The macOS `max` must be at or below 80 ms: baseline
   main measured 79.0 ms, so a green run above 80 ms has no headroom
   and comes back. Measurement pushes to the PR branch are allowed;
   write "measurement" in the commit message. The final tree must hold
   the shipping fix.

6. **Report the numbers.** Before and after, same host, three runs
   each: the largest task with `start >= shownAt` at 4x and at 6x,
   editable and firstPreview. Add the CI numbers of item 5.

## Rules
- The 100 ms task budget, the 32 ms frame budget, the 1,000 ms
  first-screen budget, the 5 s window, the 360 s poll and every
  assertion stay as they are. No skip, no retry, no platform exception,
  no threshold change.
- The skip removal stays. `grep -rn MDEDITOR_SKIP_PERF` over `src`,
  `scripts`, `test`, `playwright.config.ts` and `.github` must find no
  hit.
- Do not change how a document at or below 4 MiB behaves. It keeps the
  markdown language, the highlighting and the folding.
- On this host the AC-PERF rows are information only: run them once,
  record the numbers, move on. A red host row is not fixed by changing
  a test.
- No test-environment branches in src. No mocks of our own modules.
- Comments stay one or two lines.
- Every commit must be the full shipping state. Run `npm run verify` on
  the committed tree: everything except the information-only host perf
  rows must be green, with zero retries.

## Tests (criterion ids)
- AC-PERF-10: green on CI on macOS, Windows and Ubuntu for
  `test/e2e/preview-perf.spec.ts`, the open-task test included. The
  assertion stays the same.
- AC-PERF-11: the 20 MB first screen stays inside 1,000 ms on CI;
  record the host number.
- Every new unit test for a changed guard, red under its own mutation.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit
0. `npx playwright test test/e2e/preview-perf.spec.ts` is green on this
host for everything except the information-only rows; the 20 MB render
must complete. The pushed candidate shows AC-PERF-10 green on the
macOS CI job, with `max` at or below 80 ms. The report names the traced
task and its source, the window commit that caused it, the fix, the red
mutations, and the numbers before and after.
