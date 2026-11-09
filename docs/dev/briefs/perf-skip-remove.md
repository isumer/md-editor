# Remove the temporary AC-PERF skip (dev lane)

Base: main

The owner's temporary order (brief perf-skip-temporary.md, 2026-11-08)
skipped the AC-PERF e2e tests in CI "until the perf fix". The fix landed
on main as dccee2b (perf-open-long-task-7, "Omit Markdown support for
large documents"). This item turns the AC-PERF tests back on.

## Task
1. `playwright.config.ts`: remove the `MDEDITOR_SKIP_PERF` grepInvert line
   and its comment.
2. `.github/workflows/ci.yml`: remove `MDEDITOR_SKIP_PERF: "1"` from the
   e2e steps.
3. Do not touch the separate macOS AC-PERF-09 skip in
   `test/e2e/preview-perf.spec.ts` (it waits for a real-Mac measurement,
   PR #9).
4. Run the AC-PERF e2e locally (`--grep @AC-PERF`) and report each test's
   measured value against its budget. Do not change any budget, retry
   count or test.

## If an AC-PERF test is red
Do not skip it again. Report the test, the OS, the measured value and the
trace in the PR text; the reviewer queues the product fix.

## Allowed files
`playwright.config.ts`, `.github/workflows/ci.yml`.
