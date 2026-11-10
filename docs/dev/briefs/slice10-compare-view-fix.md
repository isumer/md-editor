# Slice 10 compare view - fix round 1 (gate findings, coverage, perf)

Base: continues the PR branch `feature/slice10-compare-view` at `6b404e3`.
Run `git merge origin/main` first. Main moved since the branch started
(slice 11 merge view landed): expect conflicts in `src/renderer/main.ts`
and `src/renderer/editor.ts`; keep both features' wiring. Fix only what
this brief lists. No new dependencies. Commit after each item. Show a
red test or a red mutation for each behaviour change (AGENTS.md).

## Why the branch came back
The gate review (report on the PR) and CI found:
1. CI red on ubuntu, run 42632302171, job "Check coverage ratchet":
   statements 98.68 percent against the 99.04 baseline, branches 96.91
   against 97.34, functions 98.61 against 98.81, lines 98.92 against
   99.14. The compare feature caused the drop: compare.worker.ts 0 of 5
   statements covered, controller.ts 54 of 60, state.ts 59 of 61,
   view.ts 72 of 76.
2. `npm run verify` failed AC-PERF-02 on the gate run: p95 54.5 ms
   against the 50 ms budget. Main measures p95 36.1 ms on the same
   Raspberry Pi (review run, n = 30). Item 7 rules this measurement.
3. AC-R14-01 is marked implemented, but none of the triggers its When
   clause names exists (tab menu "Compare with...", two sidebar
   selections, `--diff a b`). Part 1 ships the File-menu command.
4. The compare worker is created once, held readonly and never
   restarted. After a worker error the editor and preview stay hidden,
   and the next compare request silently does nothing.
5. The worker request and response types live inside the renderer
   feature. The architecture puts worker contracts in
   `src/shared/workers` (see render.ts) and validates messages at the
   worker entry.
6. The compare e2e test failed 1 of 3 precheck repeats: the left
   heading showed "right.txt" (repeat 2, error context in the precheck).
7. The default chord Ctrl+Alt+C (Cmd+Alt+C) collides with AltGr text
   input on Windows layouts.

## Allowed files
- `src/renderer/features/compare/**`
- `src/shared/workers/compare.ts` (new)
- `src/renderer/core/keymap.ts`
- `src/renderer/tabs/documentCommands.ts`
- `src/renderer/main.ts` (wiring only)
- `src/shared/messages/en.ts` (new message keys only, if an item needs one)
- `docs/acceptance/R14-compare.md`
- `test/unit/compareWorker.test.ts`, `test/unit/compareController.test.ts`,
  `test/unit/compareState.test.ts`, `test/unit/compareView.test.ts` (new
  or existing), `test/unit/keymap.test.ts`, `test/unit/menu.test.ts`,
  `test/unit/tabsDocumentCommands.test.ts`
- `test/e2e/compare.spec.ts`
- `CHANGELOG.md` (only to delete the line named in item 8)

Nothing else. `coverage-baseline.json` must not change. No coverage,
lint or depcruise rule may be loosened.

## Item 1 - move the worker contract to src/shared/workers/compare.ts
Create `src/shared/workers/compare.ts` after `render.ts`:
- Define the request and response wire types there, self-contained.
  Files under `src/shared` have zero imports, not even type-only ones
  (depcruise enforces this). Define the wire data shapes (highlight
  mode, row kind, side, row, state, span kind and text) locally in the
  contract file; the renderer feature imports them from shared.
- Cap each side's text like render.ts caps text. Reject an oversized
  request at the entry.
- `compare.worker.ts` validates every message before it runs the diff,
  the way the render worker entry does: reject non-objects, wrong or
  missing keys, wrong types, hostile own prototype keys, oversized text.
  Post nothing for a rejected message.
- Delete the contract types from
  `src/renderer/features/compare/worker.ts`; the handler keeps only the
  logic and uses the shared types.
- Unit tests for the malformed cases, red first (the render-worker
  contract tests are the pattern): non-object, wrong keys, wrong types,
  prototype keys, oversized text, and one valid request that diffes.

## Item 2 - supervise the compare worker
`src/renderer/features/compare/controller.ts`:
- On a worker error: close the compare surface, restore the exact prior
  hidden state of the editor and the preview, show the
  `compare.workerFailed` message, and replace the worker so the next
  open works. Snapshot the prior `hidden` state as a value, not a
  boolean: an element with `hidden="until-found"` must return to that
  state, not to `hidden=""`.
- On a rejected response (`ok: false`): show the message and restore the
  surface the same way.
- The worker is no longer `readonly` and is created fresh for the next
  compare after a failure.
- Tests, red first: (a) an error during a compare restores the surface
  and names the failure; (b) a compare started after that error
  succeeds on the new worker; (c) a rejected response restores the
  surface and shows its message.

## Item 3 - replace the Ctrl+Alt+C chord
- `src/renderer/core/keymap.ts`: `DEFAULT_BINDINGS` changes
  `"Mod-Alt-c"` to `"Mod-Shift-c"`. Remove the AltGraph branch in
  `chordForEvent` that was added for the old chord. Keep the Windows
  Ctrl+Alt text rule that is already there.
- `src/renderer/tabs/documentCommands.ts`: the `file-compare-open`
  accelerator changes from `CmdOrCtrl+Alt+C` to `CmdOrCtrl+Shift+C`.
- Update `test/unit/keymap.test.ts`, `test/unit/menu.test.ts` and
  `test/unit/tabsDocumentCommands.test.ts` red first: the new chord
  fires the command, the old chord does not, AltGr input still types
  text.

## Item 4 - AC-R14-01 returns to planned
`docs/acceptance/R14-compare.md`: change AC-R14-01 from
`status: implemented` to `status: planned`. The File-menu command and
the e2e test stay. The acceptance report must show the row as planned
with its test listed ("planned (tested)"). AC-R14-02 and AC-R14-07 stay
implemented. A later R14 part adds a trigger the When clause names and
flips the row back.

## Item 5 - fix the compare e2e race
`test/e2e/compare.spec.ts` failed 1 of 3 precheck repeats: the left
heading showed "right.txt". Likely cause: `launchEditor` returns at the
first window, the argv open of `left.txt` can complete after the dialog
open of `right.txt`, and `registry.all()` then lists right before left.
- After `launchEditor(leftPath)`, wait for the `left.txt` tab before the
  dialog opens `right.txt`.
- Prove the fix: run this spec with `--repeat-each 10` twice; every run
  green. If the race still appears, fix the ordering in code (the
  controller pair or the registry), never with a retry or a longer
  timeout.

## Item 6 - F7 updates only the moved selection
`src/renderer/features/compare/view.ts` and `controller.ts`: F7 and
Shift+F7 change the selected change group. They must update only the old
and the new group (class attribute and scroll), not re-render every
compare row. Unit test, red first: across a move, DOM nodes of rows
outside the two groups keep their identity.

## Item 7 - AC-PERF-02 keystroke latency
The gate measured p95 54.5 ms on this branch. The review re-measured on
the same machine: this branch p95 27.3 ms and main p95 36.1 ms (n = 30
each), both passing. The gate number did not reproduce. After items 1
to 6, run the single test:
`node scripts/run-e2e.cjs --grep AC-PERF-02`.
- If p95 is under 50 ms, record the number in the PR text and stop.
- If p95 is still over 50 ms, find the per-keystroke overhead this
  branch adds and remove it. Start with the document-level keydown
  capture listener the controller installs at construction, the work
  `chordForEvent` does per keydown, and any per-update work the compare
  wiring added to `src/renderer/main.ts`.
- Do not widen the 50 ms threshold, add retries, skips or caches that
  main does not have.

## Item 8 - remove the out-of-scope CHANGELOG line
`CHANGELOG.md`: delete the "Two open files can be compared side by
side..." line the branch added under `[Unreleased]` Added. It was
outside the slice's allowed files. The reviewer writes the merge entry.

## Done means
- `npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
  `npm run check:coverage` (unchanged baseline), `npm run
  check:licenses`, `npm run check:acceptance` all pass.
- `npm run verify` passes, or the only red is AC-PERF-02 on this
  machine with the numbers and the analysis from item 7 in the PR text.
- The compare e2e spec passes `--repeat-each 10` twice.
- Every behaviour change has its red evidence in the PR text.
