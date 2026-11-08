# Temporary: skip AC-PERF e2e in CI (owner order, 2026-11-08)

The owner orders the AC-PERF end-to-end tests skipped until further notice, so the
backlog of reviewed PRs can land. The macOS perf failure is tracked by
perf-open-long-task-5; this item does not fix it and must not change any budget.

## Task
1. `playwright.config.ts`: when `process.env.MDEDITOR_SKIP_PERF === "1"`, set
   `grepInvert: /@AC-PERF/`. Comment: temporary owner order 2026-11-08, remove with
   the perf fix.
2. `.github/workflows/ci.yml`: set `MDEDITOR_SKIP_PERF: "1"` on the e2e step only.
3. Do not edit, skip or mark any test file; do not change any budget or retry count.
4. Run `npm run verify` with and without the variable; both must pass on Linux
   apart from known AC-PERF results.

## Allowed files
`playwright.config.ts`, `.github/workflows/ci.yml`.
