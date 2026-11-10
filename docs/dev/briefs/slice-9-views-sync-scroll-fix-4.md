review: deep

# Slice 9 fix 4: move sync-scroll layout reads off the scroll frames

Base: continues the PR branch `feature/slice9-views-sync-scroll` at
`596bf9c` (the gated candidate). Run `git merge origin/main` first.
Main's CI is red at `7b78693`; `ci-fix-7b78693.md` owns that fix. A row
that reproduces on current main alone is out-of-branch: name it, do not
fix it here. Add no features. No new dependencies. One commit per item.
Show a red test or a red mutation for each behaviour change (AGENTS.md).

## Why the first three rounds did not converge (read first)

Rounds 1-3 (jobs 1225/1227, gate 1162, gatefix 1248/1263) closed
functional defects one at a time: stale anchors, a widened menu type,
the coverage ratchet, criterion tags, the feedback test. Each round
patched a visible symptom of one design fault: the scroll handlers read
layout during the scroll frame (a delayed refresh here, a re-target
reset there). Gate 1265 measured the fault itself: the 500 KB
AC-PERF-09 fling recorded 19 frames over 32 ms, maximum 133.3 ms, and
the branch's own frame-budget test at
`test/e2e/sync-scroll.spec.ts:227` measured a 705.1 ms editor frame on
Windows CI. Earlier briefs never named the required design (cache
geometry, refresh outside scroll processing) nor desktop CI green as the
definition of done. This brief names both. Symptom patches will be sent
back.

## Items

1. **Blocker — no layout reads inside scroll processing.**
   `src/renderer/features/sync-scroll/controller.ts`: while a preview
   scroll is in flight, `applyPreviewTarget` calls `anchorsForTop`,
   which binary-searches the pages and measures each probed page
   (`pageAnchor` -> `getBoundingClientRect`, lines ~163-180), then
   `nearbyPageAnchors` enumerates and measures `.preview-block`
   elements in two pages per frame (lines ~215-262). For a non-paged
   document, `refreshAnchors`/`blockAnchors` measures every block.
   Required design: after a layout change, compute page and block
   geometry once into a plain numeric cache. During scroll processing
   read only `scrollTop`/`scrollLeft` and the cached numbers: no
   `getBoundingClientRect`, no `querySelectorAll`, no
   `scrollHeight`/`clientHeight` or any other layout API while a
   scroll frame handler runs. Refresh the cache outside the scroll
   frame, on: `contentvisibilityautostatechange`, the
   MutationObserver's records (one refresh per frame, debounced), the
   ResizeObserver (debounced), fill completion, and document switch.
   Mapping results for the same geometry must not change.
   Proof: extend `test/unit/syncScrollController.test.ts` with a
   counter-carrying host whose layout methods record every call; a
   scroll-through of the pages must assert zero layout calls made
   during the scroll-frame callbacks. Show it red before the cache
   lands (or red when the cache read is replaced by a live measure).
2. **Blocker — AC-PERF-09 green on desktop CI, no budget changes.**
   This is item 1's definition of done: on your candidate,
   `test/e2e/preview-perf.spec.ts:399` (500 KB fling, zero frames over
   32 ms) passes on ubuntu and windows, and
   `test/e2e/sync-scroll.spec.ts:227` (editor and preview frame max
   <= 32 ms) passes on all three OSes. Do not skip, retry, widen or
   re-time any budget. Record the Pi numbers for both rows in the note
   from item 3; on this Pi they are information only (platform rule in
   `docs/acceptance/PERF-response-time.md`).
3. **Blocker — AC-PERF-02 keystroke p95.** Pi verify measured 56.5 ms
   against the 50 ms limit (gate 1265); the row was green on desktop CI
   for `596bf9c`. The branch adds renderer observers and handlers at
   open time (`src/renderer/main.ts`,
   `src/renderer/features/views/install.ts`). Measure the AC-PERF-02
   row on this machine on current `origin/main` and on your branch,
   n=30 each, and write both distributions to
   `docs/reviews/2026-11-10-slice9-fix4-perf-verification.md`. If the
   branch regresses the p95, name the added per-keystroke work (an
   observer callback that runs per keystroke is the suspect) and move
   it off the keystroke path. If the distributions match, record that
   and let desktop CI be the gate.
4. **Major — AC-R2-05 must cover the trailing resize action.**
   `test/e2e/views.spec.ts` reads the top preview block right after the
   resize loop, but production `finishResize` runs
   `RESIZE_SETTLE_MS` (500 ms) after the last resize event
   (`src/renderer/features/views/viewController.ts`). Ubuntu CI proved
   the position does not survive it: `topBlockAfter != topBlock`
   (run 42836368633). Required: after the resize loop, poll through the
   whole settle window (at least `RESIZE_SETTLE_MS` past the last
   resize event) and assert the top block never differs from the
   before value and still equals it after the trailing action. If the
   assertion fails, the product must hold the top block through final
   layout — fix the code, not the assertion. Mutation evidence: break
   the trailing resize handling (e.g. empty `finishResize`'s work) and
   show the test red.
5. **CI-red rows inside branch-owned tests on `596bf9c`** (run
   42836368633) — make them green on desktop CI:
   - AC-R3-03 feedback (`test/e2e/sync-scroll.spec.ts:128`) red on
     macOS and Windows: the predicate at `:149` timed out. Decide from
     the product whether the preview still moves after the editor
     settles (a late `refreshAndReapply` re-target is the suspect). If
     it moves, fix the product so one user gesture causes one settling.
     Never widen the 2 s timeout or the 1 s stability window.
   - AC-R2-04 focus mode (`test/e2e/views.spec.ts:161`) red on macOS:
     chrome stayed hidden after Escape at 2000 ms. Root-cause the exit
     path: native full-screen exit on macOS is asynchronous and the
     class toggle must follow its completion signal. Assert the
     completion signal; never widen a timeout.
   - macOS AC-PERF-11 (`1180 ms` against `<1000`): the branch adds open
     work; prove the row is not yours with the item-3 style same-machine
     main comparison, or cut per-document open work (defer observers
     until first scroll). If it stays red with a clean comparison, the
     row is owned by `perf-open-long-task-9-fix-1.md`: record that, do
     not tune the budget.
6. **Acceptance honesty.** The branch flips AC-R2-01..07 and
   AC-R3-01..04 to `implemented` in `docs/acceptance/R02-view-modes.md`
   and `docs/acceptance/R03-sync-scroll.md`. AC-R2-04, AC-R2-05 and
   AC-R3-03 have red CI legs, so flip those three rows back to
   `planned` now. Re-flip each to `implemented` only when your
   candidate's desktop CI is green on its tests. The reviewer marks the
   flip Protected-change; record flips in your report.
7. **`check:acceptance` must not regress against main.** Main reports
   AC-PERF-02/03/07/08 untested today (`perf-skip-temporary` owns the
   checker exemption). Do not touch `scripts/check-acceptance.mjs`, the
   exemption, or any threshold; your branch must add no new missing
   rows.

## Allowed files

- `src/renderer/features/sync-scroll/**`
- `src/renderer/features/views/**`
- `src/renderer/main.ts`
- `test/unit/syncScrollController.test.ts`,
  `test/unit/viewsController.test.ts`, `test/unit/viewsInstall.test.ts`
- `test/e2e/sync-scroll.spec.ts`, `test/e2e/views.spec.ts`
- `test/e2e/preview-perf.spec.ts` — console output and marks only
- `docs/acceptance/R02-view-modes.md`, `docs/acceptance/R03-sync-scroll.md`
- `docs/reviews/**`, `CHANGELOG.md`

## Done means

- `npm run verify` (pipeline locked npm) once at the end; the unit and
  e2e rows for this slice green on this host.
- Item 1's layout-call test shown red-then-green; mutation evidence for
  items 2 (budget survives), 4 and 5 recorded in the report.
- Item 3's same-machine comparison written to the `docs/reviews` note.
- The report lists every AC-PERF-02/-09/-11 number it saw, per leg,
  and names anything you could not check.
