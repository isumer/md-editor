# Slice 9 fix - make the view and sync-scroll evidence real (dev lane)

Base: feature/slice9-views-sync-scroll (the reviewed branch at 96093c3;
continue it and do not rebase)

The review of 96093c3 found four defects and two cleanups. The precheck
ran AC-R3-02 three times and it failed three times. It ran AC-R2-05 three
times and it failed three times. AC-R3-05 does not test what its
criterion says. The menu command channel bypasses the typed IPC contract.
The Sync Scroll menu item shows a checkbox that never changes. One
message key is dead.

The features are close. The product code needs a real fix for the stale
sync anchors. Most of the rest is test honesty.

Do not change a performance budget. Do not add a skip. Do not raise a
timeout to hide a race. Do not add a package.

## Review evidence

Keep these facts in mind. Do not re-derive them.

1. AC-R3-02 (`test/e2e/sync-scroll.spec.ts:36`) calls
   `heading.parentElement?.scrollIntoView()` on the heading near line 96.
   The editor then shows `## Heading 26` or `## Heading 21`, not
   `## Heading 20`.
2. A probe on the sync fixture measured the preview before the scroll at
   `scrollHeight` 8006 and after it at 6242. Nine `content-visibility`
   pages changed render state. The DOM did not mutate.
   `MutationObserver` and `ResizeObserver` did not fire, so the
   controller kept anchors from the old heights. Fresh anchors measured
   at mapping time map the same `scrollTop` 1884 to line 96, delta 0. The
   mapping module is correct. The anchor table is stale.
3. AC-R2-05 (`test/e2e/views.spec.ts:113`) starts its long-task observer
   with `buffered: true`. Buffered entries include startup and
   progressive-render tasks. Repeats 2 and 3 failed
   `expect(measurements.longTasks).toBe(0)`.
4. AC-R2-05 reads the "before" top block after only the first
   `.preview-block` attaches. `data-render-complete` is still `"false"`.
   On the 500 KB fixture a probe found `renderComplete` still `"false"`
   after about 3 s, 1492 blocks, and a growing `scrollHeight`. The top
   block can change while pages fill.
5. AC-R2-05 repeat 1 failed p95 33.3 ms against 32 ms, with the same
   start-time defect.
6. AC-R3-05 (`test/e2e/sync-scroll.spec.ts:90`) opens
   `test/fixtures/views/sync-scroll.md` (81 blocks) and measures only the
   editor scroller. The criterion names a 20 MB document and both panes.
7. `src/main/app/menu.ts` sends view commands through
   `sendViewCommand(command: string)`. The shared contract is
   `MenuCommandMessage = MenuItemId`, so the view ids bypass it. The
   renderer matches them with `Record<string, string>` and
   `String(item)`.
8. `src/main/app/menu.ts` sets `view-sync-scroll` to
   `type: "checkbox", checked: true`. Nothing updates the check mark.
   After the user turns sync scroll off, the menu still shows it on.
9. `src/shared/messages/en.ts` adds `menu.fullScreen`, but no command
   uses it.

## Allowed files

- `src/renderer/features/sync-scroll/**` (controller, mapping, tests)
- `src/renderer/features/views/**`
- `src/renderer/features/preview/preview.ts` (page and block hooks only,
  if page-level anchors need an attribute)
- `src/main/app/menu.ts`
- `src/shared/ipc/menu.ts`
- `src/shared/messages/en.ts`
- `test/unit/syncScroll*.test.ts`, `test/unit/views*.test.ts`
- `test/e2e/sync-scroll.spec.ts`, `test/e2e/views.spec.ts`
- `docs/acceptance/R02-view-modes.md`, `docs/acceptance/R03-sync-scroll.md`
- `CHANGELOG.md`

Change no other file. Keep the existing unit tests in
`test/unit/syncScrollMapping.test.ts` unchanged and green.

## 1. Fix the stale sync anchors (AC-R3-02)

Write the failing test first.

In `test/unit/syncScrollController.test.ts` add a test with this shape:

- Build a preview with one page and three blocks, and an editor stub.
- Scroll the preview and let the frame run. The editor gets the line for
  the old block heights.
- Change the page height, then dispatch `contentvisibilityautostatechange`
  on the preview.
- Let the frame run.
- Assert that the editor now shows the line for the new heights, without
  a second preview scroll.

Add a control test: the same setup with no state change keeps the old
mapping. Show both red before the fix. Restore nothing by weakening them.

Then fix `src/renderer/features/sync-scroll/controller.ts`:

- Listen for `contentvisibilityautostatechange` on the preview in the
  capture phase. The event does not bubble. Use it (or a better signal
  that you prove in the test) to refresh the anchors when a page or
  section changes render state.
- After a refresh, re-apply the last preview scroll target once, under
  the existing suppression flag. The user must not have to scroll twice.
  Keep the editor-to-preview and preview-to-editor loops suppressed.
- Keep the anchor list sorted by `blockTop` and usable across the whole
  document. A block inside a skipped page has no layout, so its rect
  collapses to the page top. Do not feed those rects into the binary
  search. One page-level anchor per `.preview-page` (10 blocks) is
  enough, and its cost does not grow with block count per scroll frame.
  If you add a line attribute to a page in
  `src/renderer/features/preview/preview.ts`, keep the change to the
  page and block hooks.
- Do not refresh all blocks per scroll frame on a 20 MB document.

Then run the e2e test ten times:

`node scripts/run-e2e.cjs --grep "AC-R3-02" --repeat-each 10`

Keep the 2 s poll, the ±1 block tolerance and the reverse-direction
assertions exactly as they are. Paste the ten results.

## 2. Make AC-R2-05 measure the resize window only

`test/e2e/views.spec.ts:113`.

- Wait for `data-render-complete="true"` before the "before" snapshot.
  Use a bounded wait well inside the test timeout. Do not raise the
  timeout.
- Take the top preview block id and line after that wait, and confirm
  layout settled (two identical reads one frame apart).
- Start the `longtask` observer without `buffered` immediately before
  the resize loop. Count only entries whose start time is inside the
  window.
- Keep the 32 ms p95 budget and `longTasks === 0`. If a long task is real
  inside the window, fix the preview resize path. Do not relax the test.
- After the loop, wait for the final layout, then assert the same top
  block id and the same line.

Run it three times: `node scripts/run-e2e.cjs --grep "AC-R2-05"
--repeat-each 3`. Paste the three results and the measured p95 and
long-task counts.

## 3. Make AC-R3-05 measure the 20 MB document

`test/e2e/sync-scroll.spec.ts:90`.

- Generate the 20 MB file in `beforeAll` with
  `test/fixtures/big/generate.mjs` and a temporary directory, as
  `test/e2e/preview-perf.spec.ts:28` does. Remove it in `afterAll`.
- Open it, wait for `data-render-complete="true"`, turn sync scroll on.
- Fling the editor in 30 steps. Record rAF frame durations in the editor
  scroller and in the preview pane.
- Assert that no frame in either pane is over 32 ms.
- After the fling settles, assert that the preview's first visible block
  line is within 2 lines of the editor's first visible line. The fling
  must not leave the two panes on different parts of the document.
- Set the test tag to `"@AC-PERF-20MB"`. The local precheck filters
  `--grep-invert @AC-PERF`, so this 20 MB row runs on CI only, like the
  AC-PERF 20 MB rows. The platform rule is
  `docs/acceptance/PERF-response-time.md:74` (20 MB performance criteria
  are enforced on desktop-class CI runners; the budgets stay). The
  budget stays 32 ms. Keep the title starting `AC-R3-05:` so the
  acceptance report maps the id.
- Run it once on this host as information. Put the numbers in the PR
  description. Do not tune it in a loop.

## 4. Type the menu command channel

- In `src/shared/ipc/menu.ts` add
  `VIEW_MENU_ITEM_IDS = ["view-split", "view-editor", "view-preview",
  "view-sync-scroll", "view-focus-mode"] as const` and
  `ViewMenuItemId`. Set `MenuCommandMessage = MenuItemId | ViewMenuItemId`.
  Keep `MENU_ITEM_IDS` and `isMenuItemId` for the File contributions.
  Keep `isMenuContribution` rejecting view ids.
- Type `sendViewCommand` in `src/main/app/menu.ts` with
  `ViewMenuItemId`.
- In `src/renderer/features/views/install.ts` replace
  `Readonly<Record<string, string>>` and `String(item)` with a typed
  `Record<ViewMenuItemId, string>` and a narrow that keeps only the five
  view ids. No index-signature fallback and no `any`.
- `npm run typecheck` is the proof. Add a unit test only if the mapping
  gains real logic.

## 5. Remove the false checkbox

In `src/main/app/menu.ts` make `view-sync-scroll` a plain item. Remove
`type: "checkbox"` and `checked: true`. The renderer owns the state and
there is no channel to update the menu. Keep the label, the accelerator
and the click.

AC-R3-04 stays as written: the menu item toggles sync scroll and the
choice survives a reload. Do not add IPC for a live check mark.

## 6. Remove the dead message key

Remove `menu.fullScreen` from `src/shared/messages/en.ts`. Full Screen is
a main-process item. Remove any other new key that no code uses. Keep
the keys that the view commands use.

## 7. Acceptance and changelog

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
3. `npm run test:unit -- --coverage.enabled=false` first, then
   `npm run test:unit` once.
4. `node scripts/run-e2e.cjs --grep "AC-R3-02" --repeat-each 10`
5. `node scripts/run-e2e.cjs --grep "AC-R2-05" --repeat-each 3`
6. `node scripts/run-e2e.cjs --grep "AC-R3-0[134]" --repeat-each 2`
7. `node scripts/run-e2e.cjs --repeat-each 2 --grep-invert @AC-PERF`
8. `node scripts/run-e2e.cjs --grep "AC-R3-05"` once, information only.
9. `npm run check:acceptance`. The 20 MB rows will report `missing` on
   this host, as AC-PERF-03/07/08 already do. Paste it and do not hide
   it.

`npm run build` is part of `test:e2e`. If a static check fails, fix the
cause.

## Mutation evidence

Show three mutations red, then restore each. Paste the failing test name
for each and `git status --short` before the commit.

1. Remove the `contentvisibilityautostatechange` listener. Your new
   unit test must fail.
2. Remove the re-apply after the anchor refresh. Your new unit test must
   fail.
3. In the AC-R2-05 helper, restore `buffered: true`. The long-task
   assertion must fail, or explain in the report why the entry set
   differs on this host.

## Report

In the final message give: the commit list, the check results, the
mutation results, the AC-R3-05 numbers, and every file you touched
outside the allowed list (there must be none).
