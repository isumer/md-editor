# Slice 9 fix 2 - typecheck, live anchors and tab isolation (dev lane)

Base: feature/slice9-views-sync-scroll (the reviewed branch at 43fa0ed;
continue it and do not rebase)

The gate on candidate 43fa0ed returned FIX. `verify` fails in typecheck.
AC-R3-02 failed 10 of 10 runs in the gate. The precheck full e2e run was
red: AC-R3-03 2 of 3, tabs AC-R4-01 3 of 3, AC-R2-05 3 of 3. The
coverage ratchet is red. The remaining defects are below.

Do not change a performance budget. Do not add a skip. Do not raise a
timeout to hide a race. Do not add a package. Do not edit a coverage
threshold, baseline or exclude.

## Review evidence

Keep these facts. Do not re-derive them.

1. `npm run typecheck` fails: `src/renderer/tabs/documentCommands.ts:102`.
   `MenuCommandMessage` is now `MenuItemId | ViewMenuItemId`. `runMenu`
   indexes the file-only `menuCommands` record without narrowing.
2. AC-R3-02 (`test/e2e/sync-scroll.spec.ts:70`) failed 10 of 10 in the
   gate. The editor stayed at `Heading 01`. Cause: during the progressive
   fill `renderComplete` is `"false"`, so every mutation goes to
   `scheduleDelayedRefresh` and its 100 ms debounce. Fill mutations reset
   the timer, so the anchors stay from startup. The first preview scroll
   maps through stale anchors to line 1. The delayed refresh never
   re-applies the preview target; only `contentvisibilityautostatechange`
   does.
3. `refreshAnchors` (`src/renderer/features/sync-scroll/controller.ts:62`)
   measures every block of every page on every refresh. Pages change
   render state while the user scrolls, so one scroll can measure the
   whole document. The rule "one page-level anchor per `.preview-page`"
   was not held.
4. The stale-anchor unit test
   (`test/unit/syncScrollController.test.ts:90`) changes block tops only.
   The page height stays 540. The real defect is a page height change.
5. `src/renderer/features/views/install.ts`: focus-mode entry can reject.
   Menu execution (line 79) and keymap execution discard the
   `commands.run` promise. `onError` is used only for Escape.
6. AC-R3-03 (`test/e2e/sync-scroll.spec.ts:89`) compares positions
   immediately after the first poll. The criterion says "both positions
   are still after 1 s". The precheck had this test red 2 of 3 with a
   deep-equality failure: the panes moved after the snapshot. A re-apply
   that moves the editor after the user's scroll is feedback.
7. Tabs AC-R4-01 (`test/e2e/tabs.spec.ts:61`) failed 3 of 3 in the
   precheck full run: after switching back to alpha the editor scrollTop
   was 40, not over 100. It passes alone. Cause: the controller is not
   document-aware. A tab switch replaces the preview and restores its
   scroll. That scroll event maps through the other document's stale
   anchors and overwrites the editor's restored scroll.
8. `npm run check:coverage` exit 1: statements 99.04 to 97.29, branches
   97.34 to 96.19, functions 98.81 to 95.66, lines 99.14 to 97.78.
   `install.ts` has no unit test.
9. The acceptance states and the CHANGELOG entry are absent. Do them
   last, only when every check is green.

## Allowed files

- `src/renderer/tabs/documentCommands.ts`
- `src/renderer/features/sync-scroll/**`
- `src/renderer/features/views/**`
- `src/renderer/features/preview/preview.ts` (page and block hooks only,
  if a page attribute is needed)
- `test/unit/tabsDocumentCommands.test.ts`,
  `test/unit/syncScroll*.test.ts`, `test/unit/views*.test.ts`
- `test/e2e/sync-scroll.spec.ts`, `test/e2e/views.spec.ts`,
  `test/e2e/tabs.spec.ts` (the AC-R4-01 test only)
- `docs/acceptance/R02-view-modes.md`, `docs/acceptance/R03-sync-scroll.md`
- `CHANGELOG.md`

Change no other file. `src/renderer/main.ts` belongs to the running
merge-view fix job: detect the document switch inside the sync-scroll
module (the mutation observer on the preview, or a preview dataset), not
in main.ts. Keep `test/unit/syncScrollMapping.test.ts` unchanged and
green.

## 1. Fix the typecheck

In `src/renderer/tabs/documentCommands.ts` narrow the id with
`isMenuItemId` before indexing the file-command map. No `any`, no index
signature.

Add a case to `test/unit/tabsDocumentCommands.test.ts`: send a view id
(for example `view-split`) through the menu-command listener and prove
that no file command runs. Show it red first by removing the narrow.

## 2. Make the anchors live during the fill (AC-R3-02)

Write the failing test first, in
`test/unit/syncScrollController.test.ts`:

- Preview with `renderComplete` not `"true"`, mid-fill: blocks are added
  over time.
- Scroll the preview before any anchor refresh has run past the
  debounce. The editor gets the line for the stale anchors.
- Let the fill continue and the frames run, with no second preview
  scroll.
- Assert that the editor now shows the line for the fresh anchors.

Then fix `src/renderer/features/sync-scroll/controller.ts`:

- Refresh anchors during the fill. The 100 ms debounce must not starve:
  bound it, so a steady fill still refreshes anchors at a fixed cadence.
- After a refresh caused by fill or layout change, re-apply the last
  preview target once, under the existing suppression flag.
- The re-apply must converge. Applying it twice in a row must not move
  the editor again. Add a unit test for that. This is what made AC-R3-03
  red: the re-apply moved the editor after the user's scroll.

Then run the e2e test ten times:

`node scripts/run-e2e.cjs --grep "AC-R3-02" --repeat-each 10`

Keep the 2 s poll, the +/-1 block tolerance and the reverse-direction
assertions exactly as they are. Paste the ten results. The e2e test can
pass on an idle host even with the defect: the scroll then lands after
the fill. The unit test above is the required proof, not the repeat
count.

## 3. Page-level anchors only

`refreshAnchors` must not measure every block of the document. One
anchor per `.preview-page` is enough. Block measurements, if you keep
any, are allowed only for the visible pages.

Add a unit test that counts block rect measurements on a multi-page
preview and asserts the count grows with the page count, not with the
block count. Show it red first on the current code.

## 4. Fix the stale-anchor fixture

In the stale-anchor unit test, change the page height, not only the
block tops. Keep the control test (no state change keeps the mapping).

## 5. Tab isolation (AC-R4-01)

The controller must not apply a mapping across a document switch.

- When the preview's document is replaced, clear the anchors and suppress
  sync until fresh anchors exist for the new document.
- A preview scroll that arrives before fresh anchors must not move the
  editor.
- The editor scroll restored by a tab switch must survive.

Write the unit test first: swap the preview content, dispatch the
preview scroll event, and assert the editor is not scrolled. Show it
red, then fix. Then prove the e2e test green in the full suite run
(check 8 below), not only alone.

## 6. Route focus-mode rejection to onError

Every path that runs the focus-mode command (menu and keymap) must route
a rejected `commands.run` promise to `options.onError`. Write the unit
test first with a rejecting `enterFullScreen`, for both paths. Show both
red, then fix.

## 7. Make AC-R3-03 prove the 1 s stability

`test/e2e/sync-scroll.spec.ts:89`.

- Scroll the editor once. Wait for the preview to settle.
- Record both positions.
- Prove both positions are still the same after 1 s. Poll over at least
  1 s of wall time and assert equality on every poll. Do not use
  `waitForTimeout`.
- Do not weaken the no-feedback assertion. If the panes still move after
  the scroll, that is a controller defect: fix section 2, not the test.

Run it five times: `node scripts/run-e2e.cjs --grep "AC-R3-03"
--repeat-each 5`. Paste the five results.

## 8. Coverage

Add jsdom unit tests for `install.ts` and any uncovered path in
`viewController.ts` and `controller.ts` until `npm run check:coverage` is
green. Do not edit thresholds, baselines or excludes.

## 9. Acceptance and changelog

Do this last, only when every check is green.

- Set AC-R2-01 to AC-R2-07 to `implemented` in
  `docs/acceptance/R02-view-modes.md`. Leave AC-R2-08 `planned`.
- Set AC-R3-01 to AC-R3-05 to `implemented` in
  `docs/acceptance/R03-sync-scroll.md`.
- Add one bullet to `CHANGELOG.md` under `[Unreleased]` / `Added`, in
  plain words, with no criterion ids.

## Checks

Run these on this host and paste the tail of each:

1. `npm run typecheck`
2. `npm run check:deps`
3. `npm run test:unit`
4. `node scripts/run-e2e.cjs --grep "AC-R3-02" --repeat-each 10`
5. `node scripts/run-e2e.cjs --grep "AC-R3-03" --repeat-each 5`
6. `node scripts/run-e2e.cjs --grep "AC-R2-05" --repeat-each 3`
7. `node scripts/run-e2e.cjs --grep "two tabs keep their own"
   --repeat-each 3`
8. `node scripts/run-e2e.cjs --repeat-each 2 --grep-invert @AC-PERF`
9. `node scripts/run-e2e.cjs --grep "AC-R3-05"` once, information only.
10. `npm run check:acceptance`. The 20 MB rows will report `missing` on
    this host. Paste it and do not hide it.

This host is a Raspberry Pi and other lanes run tests on it at the same
time. If AC-R2-05 alone is red with a p95 far over 32 ms while the gate
numbers were 16.7 ms, say so in the report and do not loop on it. A long
task that is real inside the measured window is still a defect: fix the
resize path.

## Mutation evidence

Show each mutation red, then restore it. Paste the failing test name for
each and `git status --short` before the commit.

1. Remove the document-switch suppression. The tab-isolation unit test
   must fail.
2. Remove the re-apply after the fill refresh. The new AC-R3-02 unit
   test must fail.
3. Remove the `isMenuItemId` narrow. The new documentCommands test must
   fail.

## Report

In the final message give: the commit list, the check results, the
mutation results, the AC-R3-05 numbers, and every file you touched
outside the allowed list (there must be none).
