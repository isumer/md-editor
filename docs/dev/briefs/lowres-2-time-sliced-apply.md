# Low-resource 2: time-sliced preview apply

Owner 2026-11-10: pass the 100 ms task budget (AC-PERF-10 open) on slow machines. Budgets are never widened.

## Why
`src/renderer/features/preview/preview.ts` applies append batches by a fixed count (`APPEND_TASK_BLOCK_LIMIT = 4`). On the macOS VM one apply of 4 blocks took 168 ms; a count does not adapt to the machine.

## Task
1. Replace the fixed block count with a time budget per task (a named constant, about 8 ms): apply blocks until the budget is spent, always at least one, then yield (existing `deferAppend` path) and continue. Keep the `preview-apply-start/end` marks around each slice.
2. Keep ordering, stale-response, epoch and acknowledgement (`requestNextFill` only after the last slice) behaviour exactly as today.
3. Unit tests with an injected clock: a slow clock gives one block per task, a fast clock many; ordering and the single fill acknowledgement hold.
4. Run the perf specs locally, and with `MDEDITOR_CPU_THROTTLE=4` if lowres-1 has landed; put the numbers in the PR.

## Allowed files
`src/renderer/features/preview/preview.ts`, its unit tests.
