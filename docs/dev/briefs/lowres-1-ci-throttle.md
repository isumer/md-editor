# Low-resource 1: quiet macOS runner + CPU-throttled perf job on ubuntu

Owner 2026-11-10: the app must meet its performance criteria on slow machines and pass GitHub Actions there. Budgets are never widened; no retry, no skip.

## Task
1. `.github/workflows/ci.yml`, macOS only, before the tests: turn Spotlight indexing off (`sudo mdutil -a -i off`).
2. Same workflow: run the perf specs (`test/e2e/preview-perf.spec.ts`, `test/e2e/io-worker.spec.ts`) as their own step **before** the rest of the e2e suite, on a fresh app, then run the rest with them excluded. The tests and their budgets stay identical.
3. `test/e2e/helpers.ts` `launchEditor`: when `MDEDITOR_CPU_THROTTLE` (a number, e.g. 4) is set, apply Chromium CPU throttling to the window through a CDP session (`Emulation.setCPUThrottlingRate`) right after the first window opens. Unset = today's behaviour exactly.
4. New CI job `perf-throttled` (ubuntu-latest): runs only the perf specs with `MDEDITOR_CPU_THROTTLE=4`. It starts **non-blocking** (`continue-on-error: true`), because it is expected red until the low-resource product slices land; say so in a comment with this brief's name. Making it blocking is a later owner step.
5. Print each perf number once per run (the specs already log them); the throttled job's numbers go in the PR text.

## Allowed files
`.github/workflows/ci.yml`, `test/e2e/helpers.ts`, `package.json` (scripts only).

## Done when
CI shows the perf step first on all three OS, the throttled job runs and reports numbers, and the existing jobs keep their pass/fail logic.
