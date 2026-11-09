# Slice 11 fix — make the merge result the editor's own state (dev lane)

Base: feature/slice11-merge-view (the reviewed branch at 81ca545;
continue it and do not rebase)

The review of 81ca545 found two blockers, a red coverage gate and one
surviving mutation. The merge view works when only its own buttons are
used, but it keeps the result outside the editor's authoritative state,
it parses every document on every tab switch, and its view class has no
unit coverage. AC-R15-04 is not earned yet.

The pure merge modules on main are correct. This is a wiring and
state-ownership fix, not a merge-algorithm fix.

Do not change a performance budget. Do not add a skip, a wait or a
retry. Do not add a package, raise a timeout, or edit
`coverage-baseline.json`, the coverage thresholds or the
`coverage.exclude` list.

## Review evidence

Keep these facts. Do not re-derive them.

1. A merge choice and the "Undo merge choice" button call
   `editor.replaceText(...)`, which dispatches one full-document replace
   (`src/renderer/main.ts:154-158`, `src/renderer/features/merge/mergeView.ts:153`).
   The result text and its history live in a private
   `MarkerMergeState` (`mergeView.ts:153`, `markerMergeState.ts:57`).
   CodeMirror's normal Ctrl+Z therefore undoes the document replace but
   leaves the private state and the counter alone. A probe replaced the
   private button in `test/e2e/merge-view.spec.ts:44` with Ctrl+Z: the
   editor text reverted, the counter stayed at `1 conflict left` instead
   of returning to `2 conflicts left`, and the choice buttons did not
   re-enable. Redo has the mirror problem.
2. A choice replaces the whole document with the private session text.
   A manual edit made after the last choice is silently discarded by the
   next choice. There is no test for this.
3. Every document activation calls
   `mergeView.activate(document.id, document.state.doc.toString())`
   (`src/renderer/main.ts:218`). On first activation
   `createMarkerMergeState` parses the whole document synchronously
   (`markerMergeState.ts:43`), including documents with no conflict
   markers, before `renderController.activate(document)` runs. On every
   activation — including a plain tab switch of an already-detected
   document — it stringifies the document again, and `show()`
   (`mergeView.ts:62`) rebuilds both side panes and re-parents the editor
   host each time.
4. AC-PERF-11 in the pipeline precheck: first preview 1303 ms full run,
   and editable 1497 ms / first preview 1636 ms on the targeted rerun,
   against a <1000 ms limit. The same probe recorded before this branch:
   editable 400 ms, first preview 532 ms. The parse now sits in front of
   the first preview. The tab-switch path also breaks the standing budget
   "switch tab < 50 ms, preview shown from that tab's cached blocks".
   The 20 MB rows are information only on the Pi; CI enforces them.
5. `npm run verify` is red at `check:coverage` (exit 1): statements
   99.04 → 96.92, branches 97.34 → 96.92, functions 98.81 → 97.27,
   lines 99.14 → 97.15. Cause: `src/renderer/features/merge/mergeView.ts`
   has 88 statements and 16 branches, all uncovered (0%).
6. Mutation survived on the unit suite: in `undoMarkerConflict`, changing
   `history: state.history.slice(0, -1)` to `history: state.history`
   leaves all five tests green. Only one undo is ever exercised; repeated
   undo and the `history` bookkeeping are unguarded.

## Allowed files

- `src/renderer/features/merge/**`
- `src/renderer/main.ts` (registration and wiring only)
- `src/renderer/editor/editor.ts` (only if the per-document merge
  extension or the active view must be installed or exposed; keep the
  change minimal and say why in the report)
- `src/shared/messages/en.ts`
- `test/unit/markerMergeState.test.ts` and new `test/unit/merge*.test.ts`
- `test/e2e/merge-view.spec.ts`
- `docs/acceptance/R15-merge.md`

Change no other file. Do not touch
`src/renderer/features/compare/**`, `src/renderer/features/sync-scroll/**`
or `src/renderer/features/views/**`.

## 1. A merge choice is an editor transaction (Blocker 1)

The authoritative `EditorState` owns the text and the undo history
(docs/architecture.md §3; ADR-0006). The merge session must follow it,
not shadow it.

Requirements:

- Every choice ("left", "right", "both") dispatches a normal CodeMirror
  transaction against the active document. The normal Undo and Redo
  commands — Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, the `undo`/`redo` commands
  registered in `src/renderer/tabs/documentCommands.ts:89` and their
  `Mod-z` keymap binding — must all update, in the same frame:
  the centre text, the "N conflicts left" counter, and which choice
  buttons are enabled.
- Redo must restore the accepted choice, the counter and the buttons.
- Store the per-document merge session inside the document's
  `EditorState` (for example a `StateField` installed in
  `createEditorState`), not as a private `{text, history}` pair beside
  it. The field must see every transaction, so undo, redo, programmatic
  replacement and document switching all keep the view honest. Map chunk
  offsets through `transaction.changes.mapPos` and update the field on
  any doc change, not only on the buttons' own transactions. If you use
  `invertedEffects` to make undo invert the choice effect,
  `@codemirror/commands` is already installed behind `codemirror`;
  importing it is allowed, but do not add a package or change versions.
- Do not replace the whole document on a choice. Apply the resolved
  chunk as a targeted change at its mapped position, so a manual edit
  outside the chunk survives. If the chunk's region no longer matches
  the text the session expected, do not overwrite it: disable the
  choice (or cancel with the existing status channel) and cover that in
  a test.
- Remove the private "Undo merge choice" button and every code path that
  reads the private history. Remove `merge.undo` from
  `src/shared/messages/en.ts` if nothing else uses it.
- The centre still starts from the parsed left side (the AC-R15-03
  wording: base, or left when there is no base). Keep that.
- Write the tests first. `test/unit/markerMergeState.test.ts` may use a
  real `EditorState` in the node environment for the field logic. The
  e2e spec must stop clicking the private button and instead press the
  normal chord through the shared helper
  (`PRIMARY_MODIFIER` from `test/e2e/helpers.ts`, as
  `test/e2e/commands.spec.ts:52` does), then assert the counter returns
  to `2 conflicts left`, the buttons are enabled again, Shift+chord
  re-applies the choice, and a following different choice produces the
  right text.

Evidence to paste: the red test name before the fix, then the green e2e
run for the undo/redo path.

## 2. Detection off the activation path (Blocker 2)

- Remove the `document.state.doc.toString()` call from
  `activateDocument`. A tab switch must reuse the cached merge session:
  no stringify, no parse, no side-pane rebuild. Only swap the visible
  DOM if the active document actually changed.
- Detect conflict markers once per document, off the hot path: when the
  document is opened (after the first preview is scheduled, so first
  preview is not delayed), keep the result with the document record
  alongside the rest of its cached state, and forget it when the
  document closes. Do not re-scan on tab focus, undo or choice.
- Do not build both side panes on every activation. Build them once per
  session, or reuse their DOM; the panes hold `textContent` only.
- A document without markers must not pay for marker detection on any
  activation after the first. A merge-view activation must not delay
  `renderController.activate(document)` and the first preview.
- The budgets stay as written: tab switch under 50 ms with the cached
  preview, click-to-editable under 100 ms for 100 KB, AC-PERF-11 under
  1000 ms for the first preview. On the Pi the 20 MB row is information
  only — report the numbers, do not tune to this host. The row must
  pass on the desktop CI runners without a wider limit or a retry.

Evidence to paste: the AC-PERF-11 numbers for the first preview and for
editable before and after the change on this host, plus a statement
that tab activation no longer parses (the new unit test or an
instrumented activation counter).

## 3. Make `check:coverage` green (Blocker for the gate)

`mergeView.ts` is 88 statements and 16 branches at 0%. Add unit tests,
not an exclusion.

- Add jsdom tests (`// @vitest-environment jsdom`, the pattern already
  used elsewhere under `test/unit/`) that exercise the view with a
  stub editor:
  - activate with a marker file shows the three panes, the toolbar and
    the counter;
  - the counter uses the singular form at 1 and the plural at 0 and 2;
  - choice buttons are disabled for resolved chunks and enabled for
    unresolved ones;
  - activating the same document twice does not re-parse and does not
    rebuild the panes (count the calls);
  - activating a different document swaps the session;
  - `forget` removes the session and hides the view;
  - a non-marker document shows no merge view.
- If a small DOM shell cannot be tested, move the logic out of it and
  leave only wiring behind. Do not add the file to
  `vitest.config.mts` `coverage.exclude`, do not edit the thresholds and
  do not edit `coverage-baseline.json`. If you think an exclusion is the
  only honest answer, stop and report; the reviewer decides.
- Paste `npm run test:unit` coverage summary and the ratchet result.

## 4. Undo bookkeeping (surviving mutation)

Add to `test/unit/markerMergeState.test.ts` (adapted to the new state
owner):

- after two choices the history has two entries;
- one undo returns the text and counter of the state after the first
  choice and leaves one entry;
- a second undo returns the initial text and counter and leaves none;
- an undo on an empty history is a no-op that returns an equal state.

The mutation `history: state.history` in the undo path must turn at
least one of these red. Paste the red run.

## 5. Acceptance status

- AC-R15-04 may be switched to `implemented` only when the normal Undo
  and Redo path is tested and green, including the counter and button
  state. Until then leave it `planned`.
- AC-R15-06 is already `implemented`; keep it only if the test still
  proves the side split and the conflict count.
- Do not change any other row in `docs/acceptance/R15-merge.md`.

## 6. Branch and merge

- Continue `feature/slice11-merge-view` at 81ca545. Do not rebase and do
  not force-push. Push the candidate in the same form as the other dev
  jobs.
- The precheck found a conflict with
  `origin/feature/slice10-compare-view` on the shared registration files
  and `src/shared/messages/en.ts`. Keep your registration edits minimal.
  Merge `origin/main` (or the compare branch once it lands, as the
  pipeline base says) and resolve shared-file conflicts by keeping both
  registrations; never change anything under
  `src/renderer/features/compare/**`.

## Checks

Run these and paste the tail of each:

1. `npm run typecheck`
2. `npm run check:deps`
3. `npm run test:unit` (coverage on) — this is the coverage proof.
4. `node scripts/run-e2e.cjs --grep "AC-R15-0[46]" --repeat-each 3`
5. `node scripts/run-e2e.cjs --repeat-each 3 --grep-invert @AC-PERF`
6. `npm run check:acceptance` — the 20 MB rows report `missing` on this
   host, as before; paste it and do not hide it.
7. `npm run verify` on the final tree.

## Mutation evidence

Show each red, then restore it. Paste the failing test name and
`git status --short` before the commit.

1. Stop updating the merge field on an undo transaction (or drop the
   choice effect) — the undo e2e/unit test must fail.
2. Make activation parse or stringify the document again — the caching
   unit test must fail.
3. In the undo path, keep `history` unchanged (`state.history`) — the
   double-undo test must fail.
4. Apply a choice at the stale base position instead of the mapped one
   (or restore the whole-document replace) — the manual-edit test must
   fail.

## Report

In the final message give: the commit list, the check results, the four
mutation results, the AC-PERF-11 numbers, what you changed in
`src/renderer/editor/editor.ts` and why, and every file you touched
outside the allowed list (there must be none).
