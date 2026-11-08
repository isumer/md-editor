review: deep

# Windows e2e: the argv file is not open when a test starts

Base: main. Branch `bug/windows-argv-open-flake` (from main). No new
features, no new dependencies. Follow AGENTS.md. Commit after each finding.

Parts: one test-harness fix. Depends on: nothing. It owns the files under
"Allowed files". `feature/macos-e2e` also edits `test/e2e/helpers.ts`
(it adds the chord constants). Keep those constants if they are on main,
and do not change them.

## Evidence (CI, Windows only, 2026-11-07)
- Candidate e00eb4a (`feature/macos-e2e`), run 42356096791, job
  windows-latest: `test/e2e/binary-open.spec.ts:26` @AC-R12-01 failed.
  The editor `.cm-content` was empty after the default 2000 ms expect
  timeout. 1 failed / 61 passed. ubuntu and macOS passed.
- The failure screenshot, taken at that instant, shows "Sample document"
  in the editor and in the preview. The file arrived a moment late.
- The branch changes only three chord constants in `test/e2e/helpers.ts`
  and their imports. It cannot cause this test to fail.
- main b84e49e (run 42364466790) is green on the same test and runner
  image, and AC-PERF-03 passed in the red run. So the open path works;
  the start is at the margin of the test's 2000 ms setup wait.

## Cause
`launchEditor(filePath)` returns when the first window exists. The argv
document arrives later: the renderer signals `openRequestsReady`, main
opens the file through the io-worker, the renderer applies it and updates
`document.title`. On a cold Windows runner this can take longer than the
2000 ms that the test uses for its precondition. The test then measures
startup latency in an acceptance test about binary files (AC-R12-01).

## What
- Make `launchEditor(filePath)` wait until the argv document is applied
  before it returns. Use the app's own signal: `document.title` shows the
  file name after `displayDocument` (`src/renderer/main.ts:284`,
  `src/renderer/core/document.ts:23`).
  `expect.poll(() => page.title()).toContain(path.basename(filePath))`
  with a bound no larger than the test timeout. No fixed sleeps.
- Only wait when `filePath` is passed. A launch without a file keeps the
  current behaviour.
- Do not change `playwright.config.ts` (the 2000 ms expect timeout stays).
  Do not raise the AC-PERF-03 budget in `test/e2e/io-worker.spec.ts`, and
  do not skip, retry or reorder tests. If the open fails, the test must
  fail with a clear message.
- Probe with
  `npx playwright test test/e2e/binary-open.spec.ts test/e2e/editor.spec.ts --repeat-each 10`
  on Linux; all runs must pass. Run it if your environment can launch
  Electron here; if not, say so in the report. The reviewer proves
  Windows with CI. A test that fails once in 10 runs is not fixed.
- Measure the delay on Windows (launch to title). If the argv open itself
  is slow or lost in `src/main/app/startup.ts` (the N-14 startup race),
  stop and report the file and line with the numbers. A separate brief
  owns product code; do not change `src/` here.

## Allowed files
`test/e2e/helpers.ts`. `test/e2e/binary-open.spec.ts` and
`test/e2e/editor.spec.ts` only if a test needs its own wait. Nothing else.

## Checks before you finish
`npm run typecheck`, `npm run test:unit`, and the e2e command above on
Linux. Record the launcher wait and the evidence in the report. CI on
Windows is the final proof.
