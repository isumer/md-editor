# Area R07 settings fix report

Date: 2026-11-11

## Result

The settings IPC now returns one `Result` wrapper.

Startup opens the document path before it reads settings.

System colour-scheme changes now update custom background fallbacks.

Settings writes now use the shared atomic writer.

AC-R7-03 and AC-R7-04 pass.

AC-R7-01 and AC-R7-02 remain planned.

R08 owns their settings dialog and theme controls.

No changed file is outside the allowed list.

## Red and mutation evidence

The real settings handler test received a double-wrapped `Result` before item 1 changed.

The concurrent settings-write test failed with `ENOENT` before atomic writes replaced the fixed temporary path.

The startup sequencing test failed because its orchestration module did not exist.

The shared contract tests failed because `src/shared/ipc/settings.ts` did not exist.

The system-theme tests failed because the resolver and listener did not exist.

The IPC mutation restored the double wrapper.

`test/unit/mainSettingsIpc.test.ts` then failed with the nested value.

The invalid-colour mutation returned `#ff00ff` for invalid values.

The tagged AC-R7-03 unit test then failed.

Both restored production lines passed their targeted tests.

## Commands

`git merge origin/main`

Result: passed. The branch was current.

`git merge --no-edit origin/feature/area-R07-karen`

Result: passed after resolving `src/renderer/main.ts`.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/mainSettingsIpc.test.ts --coverage.enabled=false`

Result: failed before item 1, then passed.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/background.test.ts --coverage.enabled=false`

Result: failed before startup and theme work, then passed.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/settings.test.ts test/unit/mainSettingsIpc.test.ts test/unit/preload.test.ts --coverage.enabled=false`

Result: passed.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/ioWorkerSettings.test.ts --coverage.enabled=false`

Result: failed before atomic-write reuse, then passed.

`/opt/pipeline/locked-npm run build`

Result: passed.

`/opt/pipeline/locked-npm exec -- node scripts/run-e2e.cjs --grep-invert @AC-PERF test/e2e/settings.spec.ts test/e2e/editor.spec.ts`

Result: 17 tests passed.

The argv waits ranged from 471 ms to 710 ms.

The settings rows recorded 536 ms, 522 ms, and 555 ms.

No AC-PERF e2e row ran because the owner required `--grep-invert @AC-PERF`.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/background.test.ts -t 'AC-R7-03' --coverage.enabled=false`

Result: failed with the mutation, then passed after restoration.

`/opt/pipeline/locked-npm exec -- vitest run test/unit/mainSettingsIpc.test.ts --coverage.enabled=false`

Result: failed with the mutation, then passed after restoration.

`/opt/pipeline/locked-npm run check:acceptance`

Result: AC-R7-03 and AC-R7-04 pass.

Other implemented rows remain missing because the owner prohibited the full e2e suite.

`/opt/pipeline/locked-npm run typecheck`

Result: passed.

`/opt/pipeline/locked-npm run check:deps`

Result: passed after the shared contract became dependency-free.

`/opt/pipeline/locked-npm run test:unit`

One full run passed 1,160 tests.

It reported 99.05% statements, 97.21% branches, 99.23% functions, and 99.19% lines.

The final refactor removed one uncovered branch.

Two final runs hit the documented Raspberry Pi AC-PERF-10 timeout.

The last run timed out two assertions after 5,000 ms each.

No R07 test failed.

`/opt/pipeline/locked-npm run check:coverage`

The first run detected the pre-test coverage regression.

The final run could not find `coverage/coverage-summary.json` after the known timeout.

The final source removes one uncovered branch from the 97.21% report.

The expected final branch value is 97.24%.

No coverage threshold or baseline changed.
