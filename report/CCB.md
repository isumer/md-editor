# CCB: local verify cannot satisfy AC-PERF-07

## Problem
Local verify stays red at the check:acceptance step on this host. AC-PERF-07 is
implemented. Its only testcase is an e2e perf test. Local e2e runs must exclude
@AC-PERF tests (owner speed rule, 2026-11-11). The local JUnit therefore never
contains AC-PERF-07. check:acceptance reports the criterion missing and exits 1.
No repository change can fix this without weakening a protected gate.

## Evidence
- Test: `test/e2e/preview-perf.spec.ts:709` "AC-PERF-07: 500 KB document
  keystroke latency p95 stays under 150 ms", tag `@AC-PERF-07`. It is the only
  testcase for the criterion.
- Local, this job: `npm run check:acceptance` prints "Implemented criteria
  without a passing test: AC-PERF-07" and exits 1. The row shows no test ("—"),
  not a failing test.
- Local, this job: `node scripts/run-e2e.cjs --grep-invert @AC-PERF
  test/e2e/document-views.spec.ts test/e2e/editor.spec.ts
  test/e2e/preview.spec.ts test/e2e/tabs.spec.ts test/e2e/views.spec.ts`:
  48 passed, exit 0. The written `reports/e2e-junit.xml` lacks AC-PERF-07 by
  construction.
- CI runs the perf specs in a separate step with their own JUnit file
  (`.github/workflows/ci.yml` "Run performance end-to-end tests"), then folds
  it into `reports/e2e-junit.xml` before check:acceptance ("Merge end-to-end
  test reports").
- CI numbers for AC-PERF-07, budget 150 ms: run 43276463700 (macos) p95
  23.3 ms; run 43295886602 (macos) p95 30.2 ms. Both pass with a wide margin.
- History: perf-skip-temporary added a checker exemption for this shape.
  perf-skip-remove-fix removed it on purpose and added a unit test that
  enforces the missing result (`test/unit/checkAcceptance.test.ts`).
- The carried lane output (job 1651-sync-area-R04-gatefix2-cifix2) shows the
  same row: AC-PERF-07 "—|missing" while non-perf e2e rows pass.

## What I tried
- Searched the tree for unresolved merge conflicts: none. The only conflict
  markers are committed slice-11 fixtures under `test/fixtures/merge/`.
- The four required gates pass on the merged tree: `npm run typecheck`,
  `npm run check:deps`, `npm run test:unit` (129 files, 1422 tests),
  `npm run check:coverage` (all four metrics pass).
- Refreshed `reports/e2e-junit.xml` with the affected specs. After that, only
  AC-PERF-07 stays missing. AC-R2-06, AC-R2-07 and AC-R4-12 pass.
- The acceptance checker change needed for a local pass is protected and was
  deliberately removed by perf-skip-remove-fix. I did not touch it.

## Options
1. Accept the local red row. CI on three OSes stays the gate.
   Cost: none. Every local verify on this host prints one known red row.
2. The lane runs the perf specs locally too.
   Cost: breaks the owner speed rule. AC-PERF-09 and AC-PERF-11 are known red
   on this Pi and are information only. Verify time grows by minutes.
3. Restore a scoped exemption in `scripts/check-acceptance.mjs` behind a
   lane-only env var.
   Cost: weakens a protected gate. Reverses perf-skip-remove-fix. Needs a
   Protected-change trailer and owner approval.
4. The lane folds a separately-run perf JUnit, as CI does.
   Cost: still runs the perf specs locally. The change is in the pipeline
   config, outside this repository.

## Recommendation
Option 1. Treat the local AC-PERF-07 acceptance row as information only on
this host, as the standing platform rule already does for the AC-PERF budgets.
CI on three OSes enforces the criterion. If local green is required, change the
lane config (option 4), not the repository.
