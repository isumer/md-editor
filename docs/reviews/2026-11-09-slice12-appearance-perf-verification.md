# Slice 12 appearance performance verification

Date: 2026-11-09

## Branch scope

The branch adds exactly two source files against `origin/main`.

```text
$ git diff --stat origin/main...HEAD -- src test
 src/shared/settings/appearance.ts | 101 +++++++++++++++++++
 test/unit/appearance.test.ts      | 203 ++++++++++++++++++++++++++++++++++++++
 2 files changed, 304 insertions(+)
```

The following command proves both blob identities.

```text
$ git rev-parse HEAD:src/shared/settings/appearance.ts HEAD:test/unit/appearance.test.ts
b442856daa68c06facebe223d830a5a5bc6d9ddd
d5ea05813196cb09b4c4b539250af456f444d29c
```

Only the test imports the module.

```text
$ grep -rn "settings/appearance" src test
test/unit/appearance.test.ts:11:} from "../../src/shared/settings/appearance";
```

The module has no application runtime path.

## Platform rule

`docs/acceptance/PERF-response-time.md:74` through line 81 defines the 20 MB platform rule.

Lines 76 through 80 make AC-PERF-09, AC-PERF-10, and AC-PERF-11 informational on this Raspberry Pi.

Desktop-class CI runners enforce these criteria.

The budgets stay at 32 ms, 100 ms, and 1 s.

This note does not change a budget, threshold, test, performance path, or module.

## CI evidence

Candidate `2f1b619` passed all four jobs in [run 42535279306](https://github.com/isumer/md-editor/actions/runs/42535279306).

Test jobs for `ubuntu-latest`, `windows-latest`, and `macos-latest` were green.

The Linux package and smoke-test job was green.

[Run 42519953874](https://github.com/isumer/md-editor/actions/runs/42519953874) recorded the earlier macOS red at 142 ms on `517204e`.

That result does not reproduce on candidate `2f1b619`.

## Raspberry Pi AC-PERF-11 evidence

This run used `HEAD` once, as the platform rule requires.

```text
$ /opt/pipeline/locked-npm run test:e2e -- test/e2e/preview-perf.spec.ts --grep AC-PERF-11
AC-PERF-11 20MB open: editable=888ms firstPreview=1438ms
Expected: < 1000
Received:   1438
1 failed
```

The editable result met its 1.5 s criterion.

The first preview exceeded its 1 s criterion by 438 ms.

This result is information only on this Raspberry Pi.

The platform rule removes the 30-sample requirement on this host.

## Mutation evidence

The first mutation changed `s <= 0.03928` to `s <= 0` at `src/shared/settings/appearance.ts:49`.

```text
$ /opt/pipeline/locked-npm run test:unit -- test/unit/appearance.test.ts --coverage.enabled=false
FAIL  test/unit/appearance.test.ts > AC-R7-04: computes the WCAG luminance boundary > AC-R7-04: uses the linear branch at the 0.03928 boundary
AssertionError: expected 0.000983676774575282 to be close to 0.0003035269835488375
test/unit/appearance.test.ts:112:58
AssertionError: expected 0.0030345186784249568 to be close to 0.003035269835488375
test/unit/appearance.test.ts:116:61
Test Files  1 failed (1)
Tests  1 failed | 39 passed (40)
```

The failures cover the grey 1 and grey 10 inputs.

The source line was restored after this run.

The second mutation changed `s <= 0.03928` to `s <= 0.05` at `src/shared/settings/appearance.ts:49`.

```text
$ /opt/pipeline/locked-npm run test:unit -- test/unit/appearance.test.ts --coverage.enabled=false
FAIL  test/unit/appearance.test.ts > AC-R7-04: computes the WCAG luminance boundary > AC-R7-04: uses the linear branch at the 0.03928 boundary
AssertionError: expected 0.0033387968190372124 to be close to 0.003346535763899161
test/unit/appearance.test.ts:120:61
Test Files  1 failed (1)
Tests  1 failed | 39 passed (40)
```

The failure covers the grey 11 input.

The source line was restored after this run.

All other tests stayed green in each mutation run.

## Verification

Type checking passed.

```text
$ /opt/pipeline/locked-npm run typecheck
> tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.renderer.json --noEmit && tsc -p tsconfig.test.json --noEmit
exit 0
```

The restored appearance suite passed all 40 tests.

```text
$ /opt/pipeline/locked-npm run test:unit -- test/unit/appearance.test.ts --coverage.enabled=false
Test Files  1 passed (1)
Tests  40 passed (40)
exit 0
```

Acceptance checking passed.

```text
$ /opt/pipeline/locked-npm run check:acceptance
| AC-R7-01 | planned | — | planned |
| AC-R7-02 | planned | — | planned |
| AC-R7-03 | planned | [tests] | planned (tested) |
| AC-R7-04 | planned | [tests] | planned (tested) |
exit 0
```

AC-R7-01 through AC-R7-04 stay planned.

The module stays unwired.

Full verification passed.

```text
$ /opt/pipeline/locked-npm run verify
Test Files  87 passed (87)
Tests  897 passed (897)
E2E tests  83 passed (83)
AC-PERF-09 20MB scroll: frames=114 maxFrame=16.8ms frames>32ms=0 longtasks=0 longtaskDurations=[]
AC-PERF-10 preview-latency: n=30 min=6.9 p50=19.1 p95=41.2 max=42.8 ms
AC-PERF-11 20MB open: editable=638ms firstPreview=912ms
exit 0
```

The final status contains only this allowed new file.

```text
$ git status --short
?? docs/reviews/2026-11-09-slice12-appearance-perf-verification.md
```

No package changed.
