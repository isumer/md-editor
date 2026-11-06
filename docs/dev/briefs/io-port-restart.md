review: deep

# Bug: a save after an io-worker crash fails instead of waiting for the new worker

Base: main

Depends on: item 041 (slice 5) merged. Slice 5 changes the same files. Start
only after it is on main.

Work on a new branch from `origin/main`. Add no features. No new
dependencies. Commit after each item. Show a red test first (AGENTS.md).

## Evidence
- CI run 42185726611, `Test (macos-latest)`, failed
  `test/e2e/io-worker.spec.ts:33` (AC-R5-17, "saving succeeds after the
  io-worker restarts"). The file kept its old text. The status bar showed
  "Could not save “current.md”: the file service restarted. Try again."
- The test waits for a new io-worker PID, then saves. The save still fails.

## Cause
1. The io-worker dies. `IoWorkerSupervisor.recover()`
   (`src/main/io/ioWorker.ts`) spawns a new child. It re-registers every
   grant and only then issues new ports to the windows.
2. Nothing tells the renderer that its port is dead. `IoPortClient`
   (`src/preload/preload.ts`) keeps posting on the old port. A request
   posted in this gap gets no reply.
3. When the new port arrives, `attach()` calls `failPending()`. The request
   from step 2 resolves with `WORKER_RESTARTED`.
4. On a slow machine the gap is long enough for a user save. AC-R5-17 says
   a save made after the crash must write the file.

## Items

1. **Main tells each window that its port is lost.** When the supervisor
   handles an unexpected exit, notify every attached window before
   `recover()` starts. Use a new one-way channel `io:port-lost` in
   `src/shared/ipc/io.ts`. Send it from `src/main/main.ts` through the same
   window checks as `IO_PORT_CHANNEL` (destroyed window, wrong frame URL).
   Keep the supervisor free of Electron window types: give it a callback
   per receiver, as `attachWindow` does for ports. Do not send it on
   `stop()`. Test in `test/unit/ioSupervisor.test.ts`: after a child exit,
   each receiver gets the lost signal before it gets its new port. Tag
   AC-R5-17.

2. **The preload queues requests while the port is lost.** In
   `IoPortClient`:
   - On `io:port-lost`: resolve every pending request with
     `WORKER_RESTARTED`, close the old port, and set the port to null. New
     requests and one-way messages then queue.
   - On `attach()`: fail only the requests that were posted on the old
     port. Requests queued while no port existed must be posted on the new
     port and must not fail.
   - Keep the current behaviour when a new port arrives with no lost
     signal first (fail pending, then attach).
   Test in `test/unit/preload.test.ts`: attach port A; signal lost; request
   a save; attach port B. The save is posted on B, not A, and resolves with
   B's reply. Second test: a request pending on A when the lost signal
   arrives resolves with `WORKER_RESTARTED`. The first test must be red on
   the current code: paste the red output. Tag AC-R5-17.

3. **Keep the in-flight rule.** The e2e test "a save in flight when the
   io-worker dies fails retryably and stays unsaved" must stay green
   unchanged. When the restart limit stops the supervisor, queued requests
   must get the failure-port reply (retryable), not hang. Cover this in
   `test/unit/ioSupervisor.test.ts` or `test/unit/preload.test.ts`.

## Do not change
- `test/e2e/io-worker.spec.ts`. Do not add waits, retries or longer
  timeouts to it. The fix is in the product.
- Acceptance documents. AC-R5-17 already states the required behaviour.

## Allowed files
`src/main/io/ioWorker.ts`, `src/main/main.ts`, `src/preload/preload.ts`,
`src/shared/ipc/io.ts`, `test/unit/ioSupervisor.test.ts`,
`test/unit/preload.test.ts`, `test/unit/ioContracts.test.ts` (only if a
channel list test needs the new channel). Nothing else. Do not edit
`coverage-baseline.json`, package.json, workflows or coverage config.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
`npm run check:coverage` and `npm run build` exit 0: paste each. Then
`node scripts/run-e2e.cjs --repeat-each 5` is green, except the
information-only perf tests: paste the summary. Give the red evidence for
items 1 and 2. List the changed files.
