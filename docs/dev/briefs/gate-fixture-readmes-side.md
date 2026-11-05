# Side — gate fixture READMEs (depcruise, fuses, licences)

**Base: main.** Runs alongside the current slices. This task writes only
three new README files. It is file-disjoint from every queued or running
item.

The quality-gate tests use these folders as planted inputs, but the
folders have no README. Each README must state what every fixture proves
and the exact expected result, so a reviewer can check a fixture without
reading the test. Do not change a fixture, code or test.

## Deliverables

### `test/fixtures/depcruise/README.md`
One table with one row per folder below. State the rule that must fire and
the exact source file and import that violates it. Read the fixture source
and `.dependency-cruiser.cjs`; do not guess.

- `feature-to-feature` fires `no-feature-to-feature`.
- `core-to-view` fires `core-no-codemirror-view`.
- `renderer-to-node` fires `renderer-no-node`.
- `shared-to-anything` fires `shared-no-dependencies`.
- `main-document-io` fires `main-no-document-io`.
- `cycle` fires `no-circular`.
- `own-feature-folder` is the negative control: it must not fire
  `no-feature-to-feature`.

State that `test/unit/dependencyRules.test.ts` drives the check, and that
`feature-to-feature` must report the rule exactly once.

### `test/fixtures/fuses/README.md`
State that `secure-v1.json` is an Electron fuse wire, version 1, for a
packaged app. Read `scripts/check-fuses.mjs` and give the exact expected
value for each index with its option name. Value 48 means disabled and 49
means enabled. State that `test/unit/checkFuses.test.ts` accepts this wire
and rejects it when index 0 (`RunAsNode`) is 49.

### `test/fixtures/licenses/README.md`
One row per file:

- `compatible.json`: every allowed expression is accepted by
  `isAllowedLicenseExpression`.
- `incompatible.json`: the rejected `SSPL-1.0` entry makes
  `assertAllowedLicenses` throw and names that licence.
- `or-expressions.json`: an SPDX OR expression is accepted when any branch
  is allowed; an AND that contains `SSPL-1.0` is rejected.

State that `test/unit/thirdPartyNotices.test.ts` drives the check.

## Verify
- List the three new files.
- Run each driving unit test file and paste its summary:
  `npm run test:unit -- dependencyRules`, `... -- checkFuses`,
  `... -- thirdPartyNotices`.
- `npm run verify` stays green (docs only).

## Allowed files
`test/fixtures/depcruise/README.md`, `test/fixtures/fuses/README.md`,
`test/fixtures/licenses/README.md` (new files only). Nothing else — no
fixture data, no src, no test/unit, no test/e2e, no other fixture folder,
no docs, no coverage config, no workflows.

## Done means
List changed files. Paste the three test summaries. Paste `npm run verify`
output. Plain ASCII with LF endings; no new dependency.
