# Slice 4 — preview pipeline (adaptive scheduling, block diffing, virtualisation)

review: deep

**Builds on the slice under review, `auto/side/020-slice-4-fixtures-1105-0911`**
(plus `main`), which adds `test/fixtures/big/` — the deterministic 50 KB /
500 KB committed fixtures and `generate.mjs` (20 MB at test time). This slice
replaces slice 1's fixed-debounce, whole-document preview with a preview
pipeline that stays within budget on large documents. It is architecture-heavy:
incremental parse, block diffing, and virtualisation are the core, not
optional. The parallel 3e slice (commands/keymap) also edits
`src/renderer/main.ts`; keep this slice's `main.ts` edits small and localised
to the preview wiring so the two merge cleanly.

Read AGENTS.md, docs/architecture.md §2 (workers, mirror), §9 (preview), ADR-0009
and the files `src/renderer/main.ts`, `src/renderer/features/preview/preview.ts`,
`src/renderer/features/preview/renderScheduler.ts`,
`src/renderer/features/preview/sanitize.ts`,
`src/renderer/features/preview/rewriteAssets.ts`,
`src/renderer/workers/render/handler.ts`, `src/renderer/workers/render/render.ts`,
`src/shared/workers/render.ts`, `test/e2e/helpers.ts`, and the golden render
corpus test `test/unit/goldenRender.test.ts`. No new dependencies. You can run
the full `npm run verify` here (xvfb is available); the e2e perf tests use the
committed fixtures, not wall-clock sleeps.

## Goal
Replace the fixed 150 ms debounce / whole-document markdown-it render with:
(1) adaptive scheduling that renders on a frame budget and coalesces bursts;
(2) incremental chunk parse so an edit re-parses only the chunks it touches;
(3) block diffing so the preview DOM patches only changed blocks (stable node
identity); (4) per-block sanitise and `content-visibility` virtualisation for
large documents; (5) first-screen-first rendering for large files. Every
interaction keeps the budgets in PLAN "Stability budget" and AGENTS.md
"Response-time budgets". Existing behaviour — stale-render discard, version
naming (AC-R1-05/07), sanitise, asset rewriting, link handling — must hold.

## Adaptive scheduler (`src/renderer/features/preview/renderScheduler.ts`)
- Replace the fixed debounce with frame-budget scheduling: on a burst of edits,
  dispatch at most one render per animation frame, and always dispatch within a
  bounded maximum wait so the last edit is never starved. Keep the result
  application epoch-checked (newer id wins, older discarded — AC-R1-05).
- The scheduler stays a plain class with injected time (`now`) so it is unit-
  testable without timers; no `waitForTimeout`/sleep in tests.

## Incremental chunk parse + block diffing (`src/renderer/workers/render/**`,
`src/shared/workers/render.ts`)
- Split the document into Markdown blocks (the block-level token boundaries the
  current `source-lines` rule already marks). On a change, re-parse only the
  blocks whose source range the change overlaps, and re-render those blocks to
  HTML; blocks outside the change reuse their previous HTML. The result for a
  request names the version it rendered (AC-R1-07) and carries the changed
  blocks plus their source ranges, not necessarily the whole document.
- The renderer patches the preview in place: for each changed block, replace or
  update that block's element; for every other block, keep the same DOM node
  (identity, AC-R1-09). Use `data-line` (already emitted) or a block id to
  address blocks; do not set `innerHTML` on the whole preview for an edit.
- Whole-document renders still happen for `attach` / document replacement and
  first paint; incremental renders are the edit path.
- Inject the render worker factory at the composition root so a test double can
  drive success → failure → success for AC-R1-06 without a test branch in `src`
  (see `slice-4-notes.md`).

## Per-block sanitise + virtualisation (`src/renderer/features/preview/**`)
- Sanitise per block before it reaches the DOM (reuse `sanitizeRenderedHtml`;
  no `innerHTML` with unsanitised input). The golden render corpus and the
  security tests must still pass byte-for-byte.
- Wrap off-screen preview blocks in `content-visibility: auto` (or the
  equivalent `contain-intrinsic-size`) so scrolling a large document does not
  lay out the whole DOM. The top visible block must stay unchanged across a
  window resize (budget row).
- First-screen-first: for a large document, render and show the blocks that fit
  the viewport first; the rest fill in without blocking input.

## Tests (each red against pre-change code; perf rows are statistics per AGENTS.md)
- [AC-PERF-02] e2e: 50 KB committed fixture, 30+ samples after warm-up, p95
  keystroke→preview < 50 ms.
- [AC-PERF-07] e2e: 500 KB fixture, 30+ samples, p95 < 150 ms.
- [AC-PERF-08] e2e: one keystroke patches only the changed block; the UI-thread
  patch p95 < 8 ms (measure the patch call, print the distribution).
- [AC-PERF-09] e2e: fling-scroll the 500 KB preview (and the 20 MB preview):
  PerformanceObserver records no frame > 32 ms and no `longtask`.
- [AC-PERF-10] e2e: 20 MB doc generated at test time by
  `node test/fixtures/big/generate.mjs 20971520 <tmp>`, 30+ samples, p95 < 100 ms.
- [AC-PERF-11] e2e: open a 20 MB file → editable < 1.5 s and first preview
  screen < 1 s (ready-to-show / first painted heading).
- [AC-R1-06] e2e: with the injected worker factory, a render that fails keeps
  the last good preview + shows the error, and the next success replaces both.
- [AC-R1-09] e2e: type in paragraph 3 → every other paragraph's preview element
  is the same DOM node as before (identity check via `page.evaluate`).
- [AC-R1-10] unit (counted, not timed): an edit to one paragraph of a large
  document makes the render worker re-parse only the chunks overlapping the
  change (inject a counting parser at the composition root; assert the count is
  a small constant, not proportional to document size).
- [AC-R1-11] e2e or unit: a document with an image in block A and text in block
  B; editing B does not increase the request count for A's image (observe the
  `doc-asset://` requests).
- Unit: the scheduler dispatches at most once per frame on a burst and still
  dispatches the last edit within the maximum wait (fake `now`); stale results
  after a newer applied result are dropped (AC-R1-05).
- Existing unit + e2e all pass (update paths only); golden render corpus and
  security tests unchanged.

## Allowed files
src/renderer/**, src/shared/**, test/unit/**, test/e2e/**. Nothing else — no
`test/fixtures/**` (the big fixtures already exist on the base branch), no
acceptance docs, PLAN, architecture, ADRs, coverage config, workflows,
package.json. Criteria AC-R1-09…11 and AC-PERF-07…11 are already written as
`status: planned`; do not edit the acceptance files.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste; list
files; red evidence per new test; run the e2e perf tests and paste the
distributions; name any e2e test you could not run.
