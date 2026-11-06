review: deep

# macOS e2e — make every test pass on macOS CI

Branch `bug/macos-e2e` (from main). No new features, no new dependencies.
Follow AGENTS.md. Commit after each finding.

## Goal
CI on `macos-latest` is fully green: typecheck, unit, coverage, build,
e2e. Then macOS runs on every push, not only on tags and manual runs.

## Evidence
The full log of the last macOS run is in `.ci-mac.log` (untracked, do
not commit). Unit tests pass; 10 e2e tests fail:

1. `test/e2e/commands.spec.ts` — AC-R1-08 (undo/redo chords), AC-R5-20
   (Open/Save/Save As chords and shown accelerators), AC-R5-21 (File
   action items). Likely cause: the tests or the keymap use `Control`
   where macOS uses `Meta` (Cmd), and macOS shows accelerators as
   `⌘`. Decide per case whether the app or the test is wrong. The app
   must use Cmd on macOS (platform convention); tests pick the modifier
   from `process.platform`, they are not skipped.
2. `test/e2e/save-contracts.spec.ts` — AC-R5-18 (Save writes exactly the
   edited version). Same chord question likely.
3. `test/e2e/preview-perf.spec.ts` — AC-PERF-02, -07, -08, -09 (both),
   -10 (keystroke). Read how latency is measured. If keystrokes are sent
   with a Control chord or the measurement depends on a Linux-only
   path, fix it. Do not raise thresholds and do not skip on macOS. If a
   budget truly cannot hold on the shared macOS runner, stop and write
   the numbers in the PR body; do not change it yourself.
   The AC-PERF-10 *open* test (one 101 ms task) is not yours: it is a
   product problem owned by `docs/dev/briefs/perf-main-thread-tasks.md`.

## CI
In `.github/workflows/ci.yml`, run the test matrix on
`ubuntu-latest`, `windows-latest` and `macos-latest` for every event.

## Allowed files
`test/e2e/commands.spec.ts`, `test/e2e/save-contracts.spec.ts`,
`test/e2e/preview-perf.spec.ts`, `test/e2e/helpers.ts` (only for a shared
platform modifier) and `.github/workflows/ci.yml`. Nothing else. If the
cause is proven to be in `src/`, stop and write the exact file and line
in the report: a separate dev brief owns that change.

## Checks before you finish
Linux here: `npm run typecheck`, unit, `npx playwright test` for the
touched specs, all green, with the platform logic covered for darwin in
unit tests where it lives in `src/`. macOS itself is checked by CI after
the push; you cannot run it here.
