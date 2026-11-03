# Acceptance criteria

One file per requirement from PLAN.md (`R1`…`R15`), plus `SEC` (security)
and `PERF` (response-time budgets). Each criterion is a level-3 heading
`### AC-<area>-<nn> — <title>` followed by a `status:` line
(`planned` or `implemented`) and Given / When / Then lines.

Tests reference criteria by id: Playwright `{ tag: "@AC-R5-03" }`, Vitest
test names starting `AC-R5-03:`. `scripts/check-acceptance.mjs` fails CI
when an implemented criterion has no passing test or a test tag points at
no criterion.

Criteria are written before the code of the slice that implements them.
