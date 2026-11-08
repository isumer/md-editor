review: deep

# Fix: io-port-restart after its macOS-red candidate

Base: continues the PR branch `feature/io-port-restart` (d54a9e7).
Depends on: item 041 (slice 5) on main. Queue this brief only when
`origin/main` contains the slice 5 macOS AC-R1-12 fix (83a6ac5 or a
successor of it). Do not merge `bug/slice-5-fix-2` or any other unmerged
branch. Add no features. No new dependencies. Commit after each item.

## Evidence
- Candidate e3bad31, CI run 42317046462, `Test (macos-latest)`:
  `test/e2e/recovery.spec.ts:269` (AC-R1-12) took 4.2 s. The limit is 2.5 s.
- The branch has slice 5 c0a3e96, but not 83a6ac5. 83a6ac5 fixes AC-R1-12
  on macOS (heartbeat.ts, preview.ts). Its own CI run 42323452878 passed
  AC-R1-12 on macOS.
- `src/preload/preload.ts` has 445 lines. AGENTS.md allows 400 lines. The
  preload may import only Electron and types, so it must stay one file.
- d54a9e7 holds the first-pass fixes (preload second port loss; recovery
  bound to the spawned child). Keep them and their tests.

## Items
1. Run `git merge origin/main`. Resolve conflicts in favour of main's slice
   5 code. Keep this branch's io-port behaviour. Run
   `test/e2e/recovery.spec.ts` and `test/e2e/io-worker.spec.ts`: both green.
2. `src/preload/preload.ts`: remove dead or duplicated code first. If it is
   still over 400 lines, add a one-line `max-lines` exception comment at the
   top. The comment must say why: the sandboxed preload imports only Electron
   and types. Report the exception.
3. Do not change `test/e2e/recovery.spec.ts` timing or the 2.5 s limit.

## Allowed files
`src/main/io/ioWorker.ts`, `src/main/main.ts`, `src/preload/preload.ts`,
`src/shared/ipc/io.ts`, `test/unit/ioSupervisor.test.ts`,
`test/unit/preload.test.ts`, `test/unit/ioContracts.test.ts`,
`test/unit/main.test.ts` (the exact sender-URL test for io:port-lost), and
merge results from `origin/main`. Nothing else. Do not edit
`coverage-baseline.json`, package.json, workflows or coverage config.

## Done means
`npm run verify` exits 0, except the information-only perf tests
(AC-PERF-09/10/11 on the Pi): paste the summary. Then
`node scripts/run-e2e.cjs --repeat-each 3 test/e2e/recovery.spec.ts
test/e2e/io-worker.spec.ts` is green: paste it. Give the preload line count.
List the changed files.
