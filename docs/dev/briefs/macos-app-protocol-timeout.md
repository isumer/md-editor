# macOS first-test launch timeout (AC-SEC-14)

Base: main

## Why

CI run 43054587932 (macOS) failed the first e2e test of the run:
`test/e2e/app-protocol.spec.ts:5` "the renderer loads from the app bundle origin"
`@AC-SEC-14` hit the 15 s test timeout. The next launch of the same app passed
in 3.7 s. The same test passed on main (run 43051059383) and on the Linux host.
No product code on that path changed on the branch under review.

This item owns that timeout. Do not widen the timeout, do not add retries.

## Items

1. **Name the cause of the first-launch stall.** Reproduce it on macOS CI
   (workflow_dispatch) or prove the cause from the trace and the logs of the
   failed run. State the exact step that consumed the 15 s.

2. **Fix the cause.** If the harness starts too early (Electron or Chromium
   first-run work), fix `test/e2e/helpers.ts`. If a product path stalls the
   first window, fix it in `src/` and name the file and line in the report.

## Proof

- The failed run id and the passing run id on macOS CI.
- `test/e2e/app-protocol.spec.ts:5` passes there without retries.
- No timeout, budget or assertion in the test gets weaker.

## Allowed files

- `test/e2e/app-protocol.spec.ts`, `test/e2e/helpers.ts`
- `src/**` only when the report names the proven product cause

## Done means

- The report names the cause, the commands, and the CI run ids.
- The AC-SEC-14 test passes on the macOS CI leg of the candidate.
