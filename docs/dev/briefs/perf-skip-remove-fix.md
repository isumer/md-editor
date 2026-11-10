# Remove the temporary AC-PERF skip fix - finish the removal and prove it

Base: continues the PR branch `feature/perf-skip-remove` at `4117c09`.
Run `git merge origin/main` first. No new features. No new dependencies.
Commit after each item. Show a red test or a red mutation for each
behaviour change (AGENTS.md).

## State of the branch
- `4117c09` is the PR head. Its three-dot diff against main changes two
  files: `playwright.config.ts` and `.github/workflows/ci.yml`.
- That diff is correct and stays. It removes the `grepInvert` line and
  the two `MDEDITOR_SKIP_PERF: "1"` blocks.
- `npm run verify` fails on the branch: 1 failed and 983 passed unit
  tests. `test/unit/playwrightConfig.test.ts:19` still expects a
  `grepInvert` RegExp, so it throws `expected undefined to be an
  instanceof RegExp`.
- The original brief allowed two files only. That list was too narrow.
  The temporary order also added skip support to the acceptance checker,
  its types and two unit test files. This brief authorises those files.

## Item 1 - finish the test change for the Playwright config
File: `test/unit/playwrightConfig.test.ts`.

Remove the obsolete test "excludes perf criteria when the temporary perf
skip is on". Keep one test that names the new rule: perf criteria stay
included even when `MDEDITOR_SKIP_PERF` is set to `1`. That test must load
the config with the variable set and assert that `grepInvert` is
`undefined`.

Red evidence: first restore the removed line in `playwright.config.ts:5`,
run the new test and show it red. Then remove the line again and show the
test green. Keep the env save and restore in the test.

## Item 2 - remove the obsolete acceptance skip support
Files: `scripts/check-acceptance.mjs`, `scripts/check-acceptance.d.mts`,
`test/unit/checkAcceptance.test.ts`.

The temporary order put an exemption in the acceptance checker. CI no
longer sets the variable, so the exemption is dead code. Remove all of it:

- `buildAcceptanceReport`: remove the `skipPerf` parameter, the
  `perfSkipped` branch and its comment. A missing implemented criterion
  is `missing` again, for every id.
- `runAcceptanceCheck`: remove the
  `process.env.MDEDITOR_SKIP_PERF === "1"` argument.
- `check-acceptance.d.mts`: remove the `skipPerf` parameter.
- `checkAcceptance.test.ts`: remove the three skip tests and their
  comments ("does not require an implemented perf criterion when the
  perf skip is on", "still requires every non-perf criterion when the
  perf skip is on", "keeps a planned perf criterion planned when the
  perf skip is on", "accepts a missing implemented perf result only when
  the skip is on" - remove every test that passes the old fourth
  argument or sets the variable).

Red evidence: keep or add one test that an implemented `AC-PERF-` id
with no passing test makes the report `ok === false` and lists the id in
`missing`. Run a mutation: put the `perfSkipped` branch back with
`skipPerf = true` and show that test red. Restore the removal.

## Item 3 - measure, do not tune
Run the perf suite once:
`node scripts/run-e2e.cjs --grep @AC-PERF`.

Report each test, its measured value and its budget in the PR text. Do
not change a budget, a retry count, a timeout or a test. Do not add a
skip.

On this Raspberry Pi the AC-PERF-09 and AC-PERF-11 budgets are
information only (standing platform rule; `docs/acceptance/PERF-response-time.md`).
The desktop CI legs enforce them. The gate measured AC-PERF-09 at
33.4 ms against 32 ms on this Pi. That is a Pi number and it does not
block the branch. If the candidate's CI is red on an AC-PERF row, the
reviewer queues the product fix.

## Done means
- `npm run test:unit` is green. `test/unit/playwrightConfig.test.ts` and
  `test/unit/checkAcceptance.test.ts` pass without a skip.
- `npm run typecheck` is green (the checker signature change touches
  `tsconfig.test.json`).
- `grep -rn MDEDITOR_SKIP_PERF` finds no hit in `src`, `scripts`,
  `test`, `playwright.config.ts` or `.github`.
- `npm run verify` is green, except for a Pi perf row reported with its
  measured value. Name every red row and its number.
- CI on the new head decides the perf budgets on Linux, Windows and
  macOS.
- The PR text lists the mutations and their red tests.

## Allowed files
`playwright.config.ts`, `.github/workflows/ci.yml`,
`scripts/check-acceptance.mjs`, `scripts/check-acceptance.d.mts`,
`test/unit/checkAcceptance.test.ts`, `test/unit/playwrightConfig.test.ts`.
