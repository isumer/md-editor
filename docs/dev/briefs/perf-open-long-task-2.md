review: deep

# Perf: 20 MB open still makes a main-thread task over 100 ms on macOS

Base: main. Branch `bug/perf-open-long-task-2` (from main). No new
features, no new dependencies. Follow AGENTS.md. Commit after each finding.

Parts: one fix part (dev lane). Depends on: main only. It owns the files
under "Allowed files". Nothing waits for it, but main's CI stays red on
macOS until it lands.

## Evidence (main CI, macOS leg, 2026-11-07)
1. main bf4f05b, run 42334243539: `test/e2e/preview-perf.spec.ts:111`
   AC-PERF-10, one task of 108 ms after the first editor line shows.
2. main a3c2dbb, run 42344237878: the same test, one task of 184 ms.
3. main 978ea7d, 983fd66, 43224f1 and 07696e1 were green on the same leg.
4. The earlier fix (brief perf-main-thread-tasks.md, merge b598ec2) made
   preview sections 100 blocks and paced the fill by animation frame. The
   task is still there, and it grew. So the preview fill is probably not
   the only source. Suspects: the first preview render result applied in
   one task, a large structured clone of the 20 MB text or result on the
   main thread, editor state work after the first paint, or a major GC.

Read the logs with `gh run view --job <id> -R isumer/md-editor --log`
(the job ids are in `gh run view <run> -R isumer/md-editor`). The
failure diagnostics artifact of each run holds a Playwright trace.

## Goal
1. Find which work makes the task. Reproduce on Linux with a local probe
   that sets CPU throttling (CDP `Emulation.setCPUThrottlingRate`, 4x–6x).
   Do not commit the throttling. Use a Performance trace or
   `PerformanceObserver` long-task attribution plus `performance.mark`
   around the suspects to name the function.
2. Split, defer or move that work so every task after the first editor
   line stays well below 100 ms at 6x throttling.
3. Make the AC-PERF-10 failure message name the largest task's start time
   and duration and the marks around it, so the next red run is
   self-explaining. The assertion itself must not change.
4. In your report, give the largest open task before and after, at 4x and
   6x throttling, on the same machine.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `src/renderer/features/preview/renderScheduler.ts`
- `src/renderer/workers/render/handler.ts`
- `src/renderer/workers/render/incremental.ts`
- `src/renderer/workers/render/chunks.ts`
- their existing unit tests under `test/unit/`
- `test/e2e/preview-perf.spec.ts`: the failure message only.

If slice 5 (bug/slice-5-fix-2) is on main when you start, the preview
code also lives in `src/renderer/features/preview/previewDocuments.ts`
and `src/renderer/features/tabs/**`. Then those files are allowed too.
If the cause is in any other file, stop and name the file and line in
the report. Do not change it.

## Rules
- The 100 ms budget, the 5 s window, the 30 s waits and every assertion
  stay as they are. No skip, no retry, no platform exception.
- No test-environment branches in src. No mocks of our own modules.
- Keep the macOS chords (PRIMARY_MODIFIER, DOCUMENT_START, DOCUMENT_END
  from test/e2e/helpers.ts) in any new key press.
- New behaviour gets a unit test that is red before the fix.

## Tests (criterion ids)
- AC-PERF-10: the existing e2e test, green on Linux; the message carries
  the new measurements.
- Unit tests for any new splitting or deferral, named with AC-PERF-10.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`, and
`npx playwright test test/e2e/preview-perf.spec.ts` green on Linux. The
report gives the before and after numbers. macOS is checked by CI.
