# Contributor rules

## Stability

- Never use synchronous filesystem or IPC calls on a hot path.
- Parse Markdown in a Web Worker and discard stale render results.
- Save atomically: write a temporary file in the target directory, fsync it, then rename it over the target.
- Catch every IPC handler error and return a typed error result; never let an IPC handler throw.

## Response-time budgets

| Interaction | p95 target |
|---|---|
| Keystroke → character painted in the editor | < 16 ms (one frame) |
| Switch tab | < 50 ms, preview shown from that tab's cached blocks, no re-render |
| Click a file in the sidebar → editable | < 100 ms for a 100 KB file |
| Toggle view mode / sidebar / theme | < 50 ms |
| Window resize (continuous, 500 KB doc) | No frame > 32 ms; top visible block unchanged |
| Enter / leave full screen or focus mode | Interactive < 100 ms after the OS animation |
| Open a menu or context menu | < 50 ms |
| Window shown at startup | `ready-to-show`, never a blank or white flash |

## Test standards

- **Red before green.** Every test is shown to fail on code without the behaviour (or with it deliberately broken) before it counts. Claude re-checks a sample of each slice's tests by breaking the code under them and confirming they go red.
- **Names state the rule**, e.g. `save keeps the original file when the write fails`, not `test atomicWrite 2`. One behaviour per test, arrange / act / assert in order.
- **No sleeps.** Waiting is polling on a condition (`expect.poll`, `toHaveText`) with a timeout; `waitForTimeout` is banned outside performance measurement windows.
- **Independent and deterministic.** Each test owns its temp dir and fixtures and removes them; time and randomness are injected; no test depends on another's order or on the network.
- **No flake tolerated.** Playwright `retries: 0` in CI. A flaky test is fixed or deleted, never retried into green.
- **Test what a user would notice.** E2E drives the real app through its real surfaces (menus via their ids, DOM via roles/test ids, files on disk); unit tests cover pure logic with fakes only for collaborators (fs, clock), never for the unit itself.
- **Performance tests are statistics, not single runs:** warm-up, N ≥ 30 samples, assert on p95, print the distribution in the report. Budgets are absolute; if a CI runner class is slower, its factor is a named, committed constant per platform, not a widened assertion.
- **Coverage means failure modes:** each slice lists the failure modes it guards (crash, data loss, freeze, wrong output) and the test for each; numeric coverage floors are in "Code coverage".
- **Fixtures are real:** encoding fixtures are byte files checked in with `-text`; large fixtures (5 MB, 20 MB, 5,000-file folders) are generated deterministically by a seeded script at test time, not committed.

## Test integrity

- Double only boundaries: filesystem, clock, randomness, IPC transport, Electron APIs, dialogs, and shell. Never mock the unit under test; a reviewed transport-shell test may force an otherwise unreachable collaborator error.
- Make every test assert meaningful behavior. Do not use tautologies or object-existence checks as the only assertion.
- Never skip, focus, mark todo, fixme, or expected-failure tests. Treat any skipped JUnit result as a failure.
- Never branch production code on CI, test environments, Playwright, or Vitest. Inject required hooks through normal application seams.
- Prove red before green by running changed tests against the parent source. Use a reviewed `Red-exempt: <reason>` commit trailer only for refactors.
- Run nightly mutation testing for core logic and raise issues for surviving mutants.
- Treat thresholds, coverage baselines, acceptance criteria, golden files, workflows, lint config, and test config as protected. Require a `Protected-change: <reason>` trailer when a brief permits changing them with source.
- Never regenerate snapshots or golden files in CI. Review every baseline diff.
- Independently re-run tests, break a sample to confirm red, and read every assertion in each new test file.

The test-integrity lint, skipped-JUnit, production-branch, red-proof, mutation, and protected-file gates land in slice 3 and are not wired yet; follow these rules now.

## Code quality gates

- Use strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, and `useUnknownInCatchVariables`.
- Use type-checked strict and stylistic ESLint. Ban `any`, non-null assertions, floating or misused promises, non-exhaustive switches, and unnecessary conditions.
- Keep functions within 50 lines, complexity 10, depth 4, and 4 parameters; keep files within 400 lines. Explain exceptions in a one-line lint comment and report them.
- Enforce test-integrity lint rules and the Playwright and Vitest plugins.
- Keep architecture boundaries: renderer imports no Electron, Node, or main modules; main imports no renderer modules; share only through `src/shared`; preload imports only Electron and types.
- Require Prettier, knip, and jscpd with tests excluded and duplication at or below 3%.
- Keep the renderer entry at or below 400 KB gzip and the render worker at or below 300 KB gzip. Explain growth above 5% in the commit.
- Keep commit subjects imperative and at most 72 characters; explain why in the body.
- Pin dev-only gate tools exactly and review their licence and maintenance before adding them.

Full automation for these quality gates lands in slice 3 and is not wired yet.

Run `npm run verify` before handing off a change.

Change only files named by the task. Add no new dependencies.

Write comments only when they explain why, and keep them to one or two lines.
