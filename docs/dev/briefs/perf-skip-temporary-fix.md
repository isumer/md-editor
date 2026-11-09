# Temporary perf e2e skip fix - make the filtered gate green and prove the switch

Base: continues the PR branch `feature/perf-skip-temporary` at `2fb4e5e`.
Run `git merge origin/main` first. If this job starts from main because
of the fix-base race, fetch and merge `origin/feature/perf-skip-temporary`
instead and keep that content. No new features. No new dependencies.
Commit after each item. Show a red test first where behaviour changes
(AGENTS.md).

## State of the branch
- `2fb4e5e` is the PR head. Its three-dot diff against main changes six
  files: `playwright.config.ts`, `.github/workflows/ci.yml`,
  `scripts/check-acceptance.mjs`, `scripts/check-acceptance.d.mts`,
  `test/unit/checkAcceptance.test.ts` and `CHANGELOG.md`.
- CI on `2fb4e5e` is green on ubuntu, windows and macOS.
- The original brief allowed two files only. Vision's gate removed the
  other four from its own copy to honour that list. The filtered run then
  failed `check:acceptance` on AC-PERF-02, AC-PERF-03, AC-PERF-07 and
  AC-PERF-08. That shows the allowed list is too narrow. It does not show
  the branch is wrong. This brief authorises the six files. Keep the
  exemption and keep the CHANGELOG line.

## Findings

1. **Blocker - brief scope, `.github/workflows/ci.yml:74` and
   `scripts/check-acceptance.mjs`.** The e2e filter leaves the four
   AC-PERF criteria without results. The acceptance step must receive
   `MDEDITOR_SKIP_PERF: "1"` and the checker must exempt implemented
   AC-PERF criteria only while that variable is set. The branch already
   does both. Do not remove either part.

2. **Major - `scripts/check-acceptance.mjs:151-155`.** The read of
   `process.env.MDEDITOR_SKIP_PERF` is untested. Changing the expression
   to `false` leaves all six acceptance tests green. Add a test for
   `runAcceptanceCheck` with a fixture repository root. With the
   variable set, a missing implemented perf result must be accepted.
   With it unset, the same root must fail. Use `fs.mkdtemp` to build the
   root with `docs/acceptance/PERF.md` and an empty `reports/` directory:
   a missing JUnit file parses as an empty list. Save and delete
   `process.env.GITHUB_STEP_SUMMARY` around the test so it does not
   append to the CI summary. Restore the variable and remove the root in
   `finally`.

3. **Major - `playwright.config.ts:6`.** The filter switch is untested.
   Changing `=== "1"` to `=== "0"` leaves every unit test green. Add
   `test/unit/playwrightConfig.test.ts`. Set
   `process.env.MDEDITOR_SKIP_PERF`, call `vi.resetModules()`, then
   `await import("../../playwright.config")`. With the variable set,
   `config.grepInvert` must be a `RegExp` that matches `@AC-PERF-09`.
   With it unset, `config.grepInvert` must be `undefined`. Restore the
   variable and the module registry in `afterEach`.

4. **Minor - `scripts/check-acceptance.mjs:93`.** The term
   `&& !perfSkipped` in `required` is redundant. The earlier
   `perfSkipped` arm of the result ternary decides that row, so the term
   is always true when it is read. Remove it. The tests stay green.

5. **Minor - `scripts/check-acceptance.mjs:92`.** The exemption ignores
   the criterion status. A `planned` AC-PERF criterion reports
   "skipped (perf temporary)" while the skip is on. Apply the exemption
   only to `criterion.status === "implemented"`. A planned perf
   criterion must keep its "planned" or "planned (tested)" result. Add
   one test for the planned case.

## Allowed files
`playwright.config.ts`, `.github/workflows/ci.yml`,
`scripts/check-acceptance.mjs`, `scripts/check-acceptance.d.mts`,
`test/unit/checkAcceptance.test.ts`, `test/unit/playwrightConfig.test.ts`
(new), `CHANGELOG.md`.

Nothing else. Do not edit, skip or mark any e2e test. Do not change any
budget, retry count, threshold, acceptance file or other workflow.

## Red evidence
Run each mutation alone, paste the failing run, then restore the line.

1. In `scripts/check-acceptance.mjs`, change
   `process.env.MDEDITOR_SKIP_PERF === "1"` to `false`. The new
   `runAcceptanceCheck` test must fail.
2. In `playwright.config.ts`, change `=== "1"` to `=== "0"`. The new
   config test must fail.
3. In `scripts/check-acceptance.mjs`, set `perfSkipped` to `false`
   always. The "accepts a missing perf result when the skip is on" test
   must fail.
4. Make `perfSkipped` ignore the status. The planned-criterion test must
   fail.

## Checks
- `/opt/pipeline/locked-npm run typecheck` exits 0.
- `/opt/pipeline/locked-npm run test:unit` exits 0.
- `MDEDITOR_SKIP_PERF=1 /opt/pipeline/locked-npm run verify` exits 0.
- `/opt/pipeline/locked-npm run verify` without the variable fails only
  on known local AC-PERF budgets on this host. Paste the numbers. The
  perf budgets are information only on this machine.
- Do not spend more than 10 minutes waiting for the test lock. Say so
  if it does not start.
- Push the commits. Report the CI state on the new head, or say it has
  not finished.

## Done means
- The three-dot diff against main names only the seven allowed files.
- The two new tests pass and the four red runs above are pasted.
- The CI e2e step and the CI acceptance step both set
  `MDEDITOR_SKIP_PERF: "1"`. No other step does.
- No budget, retry count, threshold, acceptance file or e2e test is
  changed.
