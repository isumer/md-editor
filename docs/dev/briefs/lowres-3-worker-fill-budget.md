# Low-resource 3: render worker fill batches sized by bytes, not chunk count

Owner 2026-11-10: first preview within 1 s (AC-PERF-11) and no long task while filling, on slow machines. Budgets are never widened.

## Why
`src/renderer/workers/render/incremental.ts` sends `INITIAL_CHUNK_COUNT = 12` and `FILL_BATCH_SIZE = 8` chunks regardless of their size, so a batch with a large table or code block costs the main thread far more than an average one (structured clone + sanitize + innerHTML).

## Task
1. Bound each initial and fill batch by rendered HTML bytes (a named constant), always at least one chunk; keep the count limits as an upper bound.
2. The initial replace still covers the first screen: keep the existing first-screen guarantee and its tests green.
3. Unit tests: a batch of many tiny chunks and one with a huge chunk both stay within the byte bound (or are a single chunk).
4. Run the perf specs (and throttled, if lowres-1 landed); numbers in the PR.

## Allowed files
`src/renderer/workers/render/incremental.ts`, `src/renderer/workers/render/handler.ts`, their unit tests.
