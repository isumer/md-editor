# Diagnose: AC-PERF-10 open task and AC-PERF-11 first preview on macOS CI

Owner decision 2026-11-10: diagnose first, decide macOS enforcement after.

## Evidence (14 recent CI runs per OS)
- ubuntu and windows: AC-PERF-10 open long tasks n=0 in every run; AC-PERF-11 firstPreview ≤ 808 ms.
- macOS: 4 of 14 runs record long tasks of 61, 93, 168 and 342 ms; firstPreview spreads 393–1180 ms (1611 ms once, at 06767da).
- The marks place the long task in different spots:
  - run 42863453888: one `preview-apply` (4 blocks, normally 3–10 ms) took 168 ms;
  - run 42864995888: a 342 ms task with no `preview-apply` mark inside it (outside our apply code);
  - run at 06767da: 47 ms before `preview-apply-start` plus 83 ms of apply in one task.
- Open question: is the cost GC, the macOS VM stalling, or our code (sanitize/innerHTML, style, layout)?

## Task
Add diagnostics only. Do not change any budget, the product code, retries, or skips.
1. In `test/e2e/preview-perf.spec.ts`, for the AC-PERF-10 open test and AC-PERF-11, record a Chromium trace through a CDP session (`Tracing.start` with categories `devtools.timeline`, `disabled-by-default-devtools.timeline`, `v8`, `v8.gc`, `blink.user_timing`) over the measured window.
2. Write the trace to `test-results/` only when the test fails, so the existing failure artifact upload carries it.
3. On every run, print one summary line per test: the top 3 long tasks with their start, duration and, for each, the summed time of GC events, script (`FunctionCall`/`EvaluateScript`), style (`UpdateLayoutTree`/`RecalculateStyles`), layout and paint events that overlap it.
4. Keep the tests' pass/fail logic unchanged. Keep the extra cost small: the trace must not move the green ubuntu/windows numbers by more than noise (compare with the values above in the PR text).
5. Run `npm run verify` and the perf spec locally.

## Allowed files
`test/e2e/preview-perf.spec.ts`, a new helper under `test/e2e/` if needed, and `.github/workflows/ci.yml` only if the failure artifact path does not already cover `test-results/`.

## Done when
The PR shows the summary line for every OS, and a macOS failure (if one occurs) ships a trace in the artifact.
