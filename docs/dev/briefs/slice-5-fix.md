review: opus

# Slice 5 fix — tabs and safety (send-back of job 087)

Work on branch `auto/060-slice-5-tabs-safety-1105-1655` (your slice-5
result). Run `git merge origin/main` first. The goals and tests in
`docs/dev/briefs/slice-5.md` still hold. This brief fixes the review's
findings only; add no features. No new dependencies.

The branch does not typecheck, the app crashes at startup, and the e2e
suite cannot run. Commit after each finding, so a partial result stays
reviewable. Follow AGENTS.md: show a red test first, then fix.

## State of the branch (review of job 087)
Red: `npm run typecheck` (9 errors in `src/renderer`, 3 in the test
project), `npm run check:deps` (1 violation), `npm run test:unit`
(`main.test.ts`), all e2e (the renderer crashes at startup). Green:
`npm run build`, `npm run check:licenses`. The review's mutations went
red: the heartbeat wait, the draft large-size boundary, and the EOL dirty
check.

## Findings (each needs a test that is red first)

1. **Blocker — the renderer crashes at startup.** `renderTabs` in
   `src/renderer/main.ts` has `for (const document of registry.all())`.
   The loop variable shadows the global `document`, so the first
   `document.createElement` throws `TypeError: e.createElement is not a
   function`. The page stays empty and every e2e test fails. Rename the
   loop variable. Then `npm run typecheck` must exit 0:
   - `preview.ts:339` and `:343`: `RenderResponse` now includes
     `RenderPongMessage`. Narrow `"op" in response` before you read
     `docId`/`epoch` and before `wiring.onResync`.
   - `main.ts:288`: `DocumentReplicationLike` has no `changed`. Add
     `changed(changes): ChangeDocumentMessage`, or type the field as the
     concrete `DocumentReplication`.
   - `main.ts:438` and `:443`: type the two `event` parameters.
   Red first: one e2e test (`editor.spec.ts` "opens an argv file") shows
   the page error now; it passes after the fix.

2. **Blocker — session file I/O in main breaks the dependency rule.**
   `src/main/app/session.ts` imports `node-shared/atomicWrite`;
   `check:deps` reports `main-no-document-io`. Do not change the rule.
   Move session read and write to the io utility process (ADR-0004). Add
   control requests to the existing control port
   (`src/shared/ipc/ioControl.ts`), for example `readSession` and
   `writeSession`, with the same exact-shape validators as the other
   control messages. Main owns the `userData/session.json` path and sends
   it. The io-worker does `readFile` and `atomicWrite`. Keep the
   `SessionStore` behaviour and `sessionStore.test.ts`.
   Red first: `npm run check:deps` reports 1 error; after the fix: 0.

3. **Blocker — the window reload path has no test.** The new
   `window.webContents.reload()` call (`src/main/app/window.ts:36`) has no
   test double. Add `reload: vi.fn()` to the BrowserWindow mock in
   `test/unit/main.test.ts`. Assert that `render-process-gone` with
   `reason: "crashed"` calls `reload` once, and that `"clean-exit"` does
   not. The `!==` guard is the mutation; it must go red.
   Red first: the current failure `window.webContents.reload is not a
   function`.

4. **Blocker — the AC-R1-12 test cannot run.** `started` is undefined at
   `test/e2e/recovery.spec.ts:194`; typecheck is red and the test throws
   `ReferenceError`. Define it just before the worker is blocked. Keep the
   2.5 s assertion meaningful. Run this test with `--repeat-each 3`.

5. **Major — a tab switch re-renders the preview.** `activateDocument`
   posts `reset` (this deletes the worker's render cache), clears the
   preview, and schedules a full render. AGENTS.md requires: switch tab
   under 50 ms, preview shown from that tab's cached blocks, no re-render.
   Keep each document's render cache in the worker; the `renders` map is
   already keyed by docId. Add a way to show a cached document in full:
   for example a `show` request that returns a `replace` result from the
   cached state, without parsing again. Do not clear the preview.
   Test: e2e opens two documents, records the preview block elements,
   switches away and back, and asserts the same block DOM nodes appear
   again with no full re-render. Keep AC-R4-01 green.

6. **Major — dirty is evaluated on every update, not once per frame.**
   `onDocumentChanged` runs on every CodeMirror update, selection changes
   included. It calls `isDocumentDirty` and `renderTabs`, which rebuilds
   every tab. The brief says "evaluated at most once per frame". Coalesce
   with `requestAnimationFrame` and update only the affected tab row.
   Test: a unit test with an injected frame scheduler; three updates in
   one frame evaluate dirty once and render tabs once.

7. **Major — an untitled dirty document is never drafted.**
   `sendDraft` returns when `document.grant === null`, and
   `IoFileService.draft` requires a grant. A renderer crash loses all
   unsaved untitled text. Allow a draft without a grant: key it by docId,
   validate the grant only when it is present, and recover it as an
   untitled document. Test: e2e kills the renderer after an edit to an
   untitled document and the text comes back. Unit: `draft` stores a
   draft with a null grant.

8. **Major — Discard leaves a draft that resurrects a closed tab.**
   `removeDocument` cancels the draft timer but does not clear a draft
   that is already written. Closing a dirty tab with Discard must send
   `clearDraft` for that docId. Test: write a draft, close the tab with
   Discard, crash and reload the renderer; the tab must not come back.

9. **Major — every e2e launch leaks a profile directory.** `launchEditor`
   creates `mdeditor-userdata-*` in the system temp dir; nothing removes
   it. This breaks the rule that each test removes the dirs it creates
   (tmpfs exhaustion on the Pi). Remove the profile dir in `closeEditor`
   when the helper created it (prefix `mdeditor-userdata-`), also on
   failure. Prove that a full e2e run leaves no new `mdeditor-*` dir in
   the temp dir.

10. **Minor — AC ids.** Check each new test's id against the criterion
    text. `test/unit/closeRequests.test.ts` "a cancelled close ..." is
    tagged AC-R4-05; it proves AC-R4-06 (quit). Fix the tags.

## Notes (do not change)
- Discard at quit keeps the unsaved text in the session (hot exit), as
  `docs/dev/briefs/slice-5.md` says and AC-R4-08 asserts. The reviewer
  reconciles the AC-R4-06 wording at merge. Keep this behaviour.
- `check:coverage` did not run in the review because the unit suite was
  red. Run it after the fixes.

## Allowed files
src/renderer/**, src/main/**, src/io-worker/**, src/shared/**,
src/preload/**, test/unit/**, test/e2e/**. Nothing else. Do not touch
`src/shared/workspace/**` or `test/unit/workspaceTreeRows.test.ts`
(slice 6 owns them). Do not edit package.json, workflows, coverage
config, acceptance docs, PLAN, architecture or ADRs.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
`npm run check:coverage` and `npm run build` exit 0 — paste each. Then
`node scripts/run-e2e.cjs --repeat-each 3` is green — paste the summary.
List the changed files. Give red evidence for each finding. Name any
test you could not run. If a 20 MB performance criterion misses on this
machine, report the numbers and stop.
