review: deep

# Slice 5 fix 2 — tabs and safety (send-back of job 869)

Work on branch `auto/864-slice-5-fix-1105-1849` (your slice-5 fix
result). Run `git merge origin/main` first. The goals and tests in
`docs/dev/briefs/slice-5.md` and `slice-5-fix.md` still hold. This brief
fixes the review's findings only; add no features. No new dependencies.
Commit after each finding. Show a red test first, then fix (AGENTS.md).

## State of the branch (review of job 869)
Green: typecheck, check:deps, unit (548), coverage, build, acceptance,
e2e x3 (231 passed). Red on this Pi only: AC-PERF-10 (information only).
Fix-1 items 1-4 and 6-10 are done. Item 5 is not.

## Findings (each needs a test that is red first)

1. **Blocker — page script can get a grant for any path.**
   `file:open-path` (`src/main/ipc/file.ts`, `api.openPath` in
   `src/preload/preload.ts`) takes a raw path from the renderer and
   returns a read and write grant. Any page script can call
   `window.api.openPath({ path: "/home/u/.bashrc" })`, then read or
   save that file. This breaks AC-SEC-09 ("presents a path ... refused")
   and architecture §7 (grants only for dialog, argv, open-file,
   drag-drop). Fix: the preload handles the drop itself. In the
   isolated world, listen for `drop` on `window`, accept only
   `event.isTrusted`, get each path with `webUtils.getPathForFile`, and
   send it over IPC from the preload. Do not expose `openPath` or
   `pathForFile` on `window.api`. The preload tells the renderer the
   result through the existing open-result path (same as File > Open).
   Session restore stays in main (`src/main/ipc/session.ts`).
   Tests: e2e (`ipc-contracts.spec.ts`): `window.api.openPath` and
   `window.api.pathForFile` are `undefined`; a page-created untrusted
   `drop` event opens nothing. Keep AC-R4-09 green with a real drop.
   Tag AC-SEC-09.

2. **Major — a tab switch rebuilds every preview node (fix-1 item 5).**
   `activateDocument` (`src/renderer/main.ts`) schedules a full render.
   The worker answers from cache, but `replaceBlocks`
   (`src/renderer/features/preview/preview.ts`) clears the preview and
   creates new elements. The brief required the same block DOM nodes.
   Fix: keep each document's preview block container (and its
   `BlockElements` map and layout) per docId. On a switch, detach the
   old container and attach the cached one. Render only when the cached
   version is older than the document version. Drop the container when
   the tab closes.
   Test: e2e opens two documents, holds element handles of the first
   tab's blocks, switches away and back, and asserts with
   `isSameNode` that the same nodes are connected again, and that no
   `preview-append` measure ran for the switch back. Tag AC-R4-01.

3. **Major — the `rendered` guard in `show()` is untested.**
   `src/renderer/workers/render/incremental.ts:246`. Removing
   `!chunk.rendered ||` leaves all 548 unit tests green. `applyChange`
   sets `rendered = false` but keeps the old `html`, so `show()` would
   return stale HTML. Add a unit test: render, apply an edit to a
   published chunk, call `show()`, expect `null`. If item 2 removes
   every caller of `show()`, remove `show()` and the `reset` op instead,
   with their tests.

4. **Major — `src/renderer/main.ts` has 1033 lines.** AGENTS.md allows
   400. Main was 453 before slice 5. Move the tab strip, close and quit
   flow, session restore and draft wiring into modules under
   `src/renderer/tabs/` (new folder). `main.ts` keeps only wiring. Each
   new file stays within 400 lines and has unit tests. No new lint
   exceptions.

5. **Carry the first-pass fixes** (they were not merged):
   - `src/renderer/core/draftScheduler.ts`: `size >= this.largeSize`
     becomes `size > this.largeSize` (slice-5 brief: "10 s above 5 MB").
     Test: exactly 5 MiB keeps the 2 s idle; 5 MiB + 1 uses 10 s.
   - `test/unit/heartbeat.test.ts`, system-timers test: assert `onPing`
     ran once (it has no assertion).
   - `test/unit/documentRegistry.test.ts`: the path-less test is not
     AC-R4-01; assert the path index excludes it, then `adoptPath`.
   - `test/unit/main.test.ts` reload test: tag AC-R4-07, not AC-R1-12.
   - `test/unit/sessionContracts.test.ts`: the close-result accept test
     is AC-R4-06; the four reject tests are AC-SEC-07.
   - `test/unit/frameCoalescer.test.ts`: the three tests prove frame
     batching (AC-R4-03 needs the marker): name what they prove.
   - `test/unit/closeRequests.test.ts:76`: the "already settled" test
     must send a request, settle it, then settle it again.
   - `src/renderer/workers/render/incremental.ts:264`: split the line
     `patch(): PatchBatch {    const pending ...`.

## Notes (do not change)
- Hot exit at quit stays (AC-R4-08). The reviewer fixes the AC-R4-06
  wording at merge.
- `clearDraft` in `removeDocument` is redundant with the io-worker
  `detach`; both stay (the e2e goes red only when both are removed).
- AC-PERF-09/10/11 are information only on this Pi. Report the numbers.

## Allowed files
Changed by the branch already: `src/renderer/main.ts`,
`src/renderer/features/preview/preview.ts`,
`src/renderer/features/preview/renderScheduler.ts`,
`src/renderer/workers/render/incremental.ts`,
`src/renderer/workers/render/handler.ts`, `src/shared/workers/render.ts`,
`src/renderer/core/draftScheduler.ts`, `src/renderer/platform/api.ts`,
`src/renderer/platform/window.d.ts`, `src/preload/preload.ts`,
`src/main/ipc/file.ts`, `src/shared/ipc/file.ts`,
`src/main/services/documentGrants.ts`, `src/main/app/startup.ts`.
New: `src/renderer/tabs/**`, `test/unit/tabs*.test.ts`.
Tests: `test/unit/{incrementalRender,draftScheduler,heartbeat,
documentRegistry,main,sessionContracts,frameCoalescer,closeRequests,
ipcContracts}.test.ts`, `test/e2e/{tabs,ipc-contracts,recovery,
helpers}.spec.ts` / `helpers.ts`.
Nothing else. Do not edit package.json, workflows, coverage config,
acceptance docs, PLAN, architecture or ADRs.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
`npm run check:coverage` and `npm run build` exit 0 — paste each. Then
`node scripts/run-e2e.cjs --repeat-each 3` is green except the
information-only perf tests — paste the summary. Give red evidence for
each finding. List the changed files.
