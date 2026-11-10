review: deep

# io-port-restart gate fix - prove the stale-port guard, mark the preload exception, keep the PR changelog line

Base: continues the PR branch `feature/io-port-restart` at `909bb2e`. Run
`git merge origin/main` first. If `origin/feature/io-port-restart` has moved
past `909bb2e`, continue from the remote tip and keep the items below.
Keep the goals of `sync-main.md` and of the io-port-restart brief. Add no
features. No new dependencies.

The Vision gate on candidate `909bb2e` listed three fixes and left them
uncommitted, so the pushed candidate still shows them open. This brief covers
all three. Item 2 is the one real code change. Item 1 adds one comment line.
Finding 3 of the gate is rejected with evidence and needs no change.

## State of the branch

- `909bb2e` is the PR branch tip. It merges main `6af550b` into the PR commit
  `d54a9e7`. No conflict marker remains.
- origin/main has moved to `47c6640`. The new main commits touch renderer,
  shared-diff, and workspace files. The branch touches `src/main/io`,
  `src/preload`, `src/shared/ipc`, and their tests. The merge should not
  conflict.

## Findings

1. `src/preload/preload.ts:1` - missing max-lines exception comment.
   **Confirmed.** `preload.ts` is 445 lines. AGENTS.md says: keep files
   within 400 lines, explain exceptions in a one-line lint comment, and
   report them. AGENTS.md also says the lint gates land in slice 3 and are
   not wired yet, and to follow these rules now. The sandboxed preload can
   import only Electron and types, so it cannot split the file to meet the
   limit. Item 1 adds the comment. The fix report must state the exception.

2. `test/unit/ioSupervisor.test.ts:427` - the stale-port test does not
   exercise the generation guard it names. **Confirmed by mutation.** The
   review inverted the guard at `src/main/io/ioWorker.ts:290`
   (`if (this.child === child)` to `!==`) on the merged tree. Baseline was
   21/21 green. Under the inverted guard the target test
   "AC-R5-17: an unspawned replacement cannot issue a stale port" stayed
   green; only four unrelated restart tests failed. The assertion at line
   427 runs before the async recovery path can act, so the guard's stale
   branch is never observed. With `await Promise.resolve();` added before
   the assertion, the same mutation turns the target test red. Item 2 adds
   the await.

3. `CHANGELOG.md:39` - the gate removed the "background file service
   crashes and restarts" entry as out of scope. **Disputed. Keep the line.**
   The entry exists at `d54a9e7:CHANGELOG.md:39`, the PR side of the merge.
   It does not exist in main `6af550b` or in the later main tip `47c6640`.
   It is the PR's own user-visible entry for this PR's crash-restart fix,
   not a line the sync brought in. `sync-main.md` requires a resolution
   that keeps both sides working; deleting the PR's own entry drops this
   PR's changelog. The pushed candidate is correct here. No action.

## Allowed files

`src/preload/preload.ts` (the one comment line only),
`test/unit/ioSupervisor.test.ts` (the one await line and its one-line
comment only).

Nothing else. Do not edit `CHANGELOG.md`, `src/main/io/ioWorker.ts`,
`src/main/main.ts`, `src/shared/ipc/io.ts`, `test/unit/main.test.ts`,
`test/unit/preload.test.ts`, `package.json`, or the workflows.

## Items

1. Add as the first line of `src/preload/preload.ts`:

   ```ts
   /* eslint-disable max-lines -- The sandboxed preload can import only Electron and types. */
   ```

2. In the test "AC-R5-17: an unspawned replacement cannot issue a stale
   port" (`test/unit/ioSupervisor.test.ts:427`), add immediately before
   `expect(received).toHaveLength(1);`:

   ```ts
   // Let the rejected replacement generation settle before asserting the stale port count.
   await Promise.resolve();
   ```

## Red evidence

1. Run
   `/opt/pipeline/locked-npm exec vitest run -- test/unit/ioSupervisor.test.ts --coverage.enabled=false`.
   All tests pass. Paste the summary line.
2. With item 2 applied, temporarily invert `===` to `!==` at
   `src/main/io/ioWorker.ts:290` and run the same command. The AC-R5-17
   test must fail. Paste the failure summary.
3. Restore the line. Run again. All tests pass. Paste the summary line.

## Checks

- `/opt/pipeline/locked-npm run typecheck` and
  `/opt/pipeline/locked-npm run test:unit` exit 0. Paste the summary lines.
- Run `/opt/pipeline/locked-npm run verify` on the committed tree. Do not
  wait more than 10 minutes for the lock. If it cannot start in that time,
  stop it and say so; the next review runs it.
- Push the commits to `feature/io-port-restart`.

## Done means

- The fix diff from the branch tip contains only the two allowed edits:
  one comment line in `src/preload/preload.ts`, one await line plus its
  comment in `test/unit/ioSupervisor.test.ts`.
- `git diff <branch-tip>...HEAD -- CHANGELOG.md` is empty.
- The red run in step 2 and the green runs in steps 1 and 3 are pasted in
  order in the report.
- The report states the preload 400-line exception, as AGENTS.md requires.
