# Fix the stale append cache on tab switch (preview-stale-append-cache)

Base: main

## Background
The first preview screen fills in paced batches. When the user switches
tabs while that fill runs, a pending non-fill response for the document
they left is dropped, so its cached blocks are lost. Switching back
re-renders the whole preview instead of reusing the cache.

## Change
In `src/renderer/features/preview/preview.ts` only:
- `applyAccepted` gains a `display` flag that defaults to true. When it
  is false, an accepted render still updates the document's cached
  preview and version, but does not display it.
- The queued-response path applies a stale non-fill response with
  `display: false`, so the cache of the document that is no longer
  shown still advances. A stale fill response keeps the old behaviour
  (re-schedule it).
- The shown preview must keep pointing at the displayed document.

A reference hunk exists in repository history: commit 332c920 on the
export area branch, reverted at review job 1443 as scope creep. Read it
for the shape. Do not merge or rebase that branch; re-apply the idea on
main.

## Allowed files
- `src/renderer/features/preview/preview.ts`
- `test/unit/preview.test.ts`

Nothing else. Do not touch `test/e2e`, other src files, configs or the
work graph.

## Tests (in `test/unit/preview.test.ts`, red first)
- A pending non-fill response for a document that was switched away is
  applied to that document's cache; switching back reuses the cached
  blocks without asking the worker for a new render.
- The shown preview still names the displayed document after the stale
  apply.
- A stale fill response is still re-scheduled, not applied.

## Done means
- Each new test fails without the change and passes with it.
- `npm run verify` passes. The Pi performance rows are information
  only; do not tune code or widen a budget for them.
- No test skipped, no retry added, no budget widened.
