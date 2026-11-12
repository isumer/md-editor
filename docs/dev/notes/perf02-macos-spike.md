# AC-PERF-02 macOS spike investigation

Date: 2026-11-12.

## Result

AC-PERF-02 now measures the shipped path again. It opens the 50 KB file
through argv and installs the probe before that document applies.

The macOS cause is narrowed but not named. Named CI attribution data is the
next step. This branch adds it; it does not guess a product fix.

The budget stays 50 ms. The test keeps 30 samples and five warm-up
keystrokes. No retry, no skip, and no platform exemption exists.

## Measurement-path fix

The earlier version launched empty, reloaded the page, and opened the file
through the menu. That is not the shipped path. The reload also reset the
probe and the code-cache state.

The test now calls `launchEditor(large50, { onPage })`. `launchEditor`
passes the file as argv. `onPage` runs after the first window exists and
before the argv document applies, so the probe exists before the render
worker starts. `installKeystrokeProbe` installs with `page.evaluate`, not
`addInitScript`, so no reload is needed.

The probe is diagnostic only. The measurement runs even if the install
fails.

## macOS evidence

Run 43213222229 (main 7bc7eb6), AC-PERF-02 distribution: 75.8, 83.4, 16.7,
7.3, then 3 to 13 ms. Only the first two samples after the five warm-up
keystrokes are slow. The e2e split in PR #85 put the perf specs first in the
job.

Run 43191832635: AC-PERF-03 (cold start) is also red on macOS. It is also
first in its job.

From the brief. Run 43127940956: 36.3, 32.2, 56.0, 79.9, 45.5, 22.7, 89.3,
then mostly 15 to 30 ms with one 69.3. Run 43115369990: 253.5 at sample 8.
Run 43109111999: a single 71.5 at sample 29.

Ubuntu and Windows do not show it.

## Narrowing

Steady-state typing is fast on macOS: 3 to 13 ms. The slow samples are the
first ones after open, on the shipped argv path. Therefore the time is work
that lands about 0.5 to 1.5 seconds after open, or a cold runner, not
typing cost. Leftover processes of the previous application are a weak
explanation: the AC-PERF specs now run first in the job, and AC-PERF-03 is
red when it runs first.

`closeEditor` already waits for the main process to exit
(`waitForProcessExit` in `test/e2e/helpers.ts`).

## Diagnostic

A sample at or above 50 ms prints one line. A green run stays quiet. The
line splits the `preview-latency` measure into `scheduler` (key to worker
post), `worker` (post to worker response), `rendererApply`
(`preview-apply-start` to `preview-apply-end`), and `unattributed`. It
prints overlapping long tasks and long-animation-frame data. Each LoAF
script carries `sourceFunctionName` and `sourceURL`.

`reportMacProcessLoad` prints the surviving process tree of the previous
application and the macOS load average at test start. It is quiet elsewhere.

## Narrowed suspects (unproven)

1. The lazy fill chain. The worker batches blocks 1 ms apart
   (`FILL_DELAY_MS`, `src/renderer/workers/render/handler.ts:263`). Each
   batch round-trips through the renderer on an rAF plus timeout chain
   (`requestNextFill`, `src/renderer/features/preview/preview.ts:339`).
   Fill occupies the worker and the scheduler after open, during the first
   samples.
2. Deferred feature work. `documentCreated` runs in a
   `window.setTimeout(..., 0)` after open
   (`src/renderer/main.ts:278`). The merge hook scans the whole source
   (`src/renderer/features/merge/wiring.ts:41`).
3. First-use compile and code cache of the renderer bundle. A cold runner
   shows this first. AC-PERF-03 failing cold on the same legs supports a
   cold-runner contribution.

## Local diagnostic data (Raspberry Pi, informational)

Budget enforcement is on CI desktop runners, not on this machine. One run
of the fixed test on this host: p50 20.7 ms, p95 67.0 ms, distribution
25.0, 62.7, 84.8, 17.0, 67.0, 13.1, 28.3, 17.7, 18.1, 15.4, 23.4, 39.3,
22.0, 20.7, 32.9, 20.3, 15.6, 56.7, 12.6, 40.7, 24.6, 13.7, 27.0, 31.0,
17.0, 14.5, 11.6, 14.8, 12.2, 30.3 ms.

The slow-sample lines printed correctly. Each showed `worker` 20.8 to 40.5
ms and `unattributed` up to 38.7 ms, with zero long tasks and zero LoAF
frames. The probe caught the argv-open worker, so the install beat the open.

## Next step, blocked here

The cause must be named from the macOS CI leg with this diagnostic. This
checkout cannot push: its git worktree admin directory is missing, so every
git command fails. One or two push runs of this branch on macOS, grepped for
"AC-PERF-02 slow sample", name the work. If the named work is inside the
renderer, fix it per the brief: move it off the keystroke path, or finish it
before the document is reported editable. If `unattributed` dominates and
no LoAF script names the work, the time is outside the renderer; report it
and stop. Do not change the budget.

## Validation

- `npm run typecheck` passed.
- `npm run check:deps` passed: 154 modules, 339 dependencies.
- `npm run test:unit` passed 1,219 tests in 118 files.
- `npm run check:coverage` passed every ratchet (statements 99.05, branches
  97.27, functions 99.08, lines 99.21 percent).
- The AC-PERF-02 e2e spec ran once locally, numbers above (informational on
  this host).
- The full e2e suite and `npm run verify` are left to the pipeline and CI.
