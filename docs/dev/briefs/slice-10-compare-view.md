# Slice 10 — compare view, part 1 (dev lane)

Base: main

Goal: the first user-visible part of R14 (docs/acceptance/R14-compare.md):
open two files side by side and see their line and word differences.
The pure modules already on main do the work:
`src/shared/diff/lineDiff.ts`, `src/shared/diff/wordDiff.ts`.

## Scope
- Read R14 and pick the criteria that "compare two open documents" needs
  (the command, the side-by-side view, line/word highlights, next/previous
  difference). Leave folder compare and anything else for later parts;
  list which criteria you took in the PR text.
- New code goes under `src/renderer/features/compare/**` and its tests.
- Registration (command, menu, message strings) may touch the existing
  registry and `src/shared/messages/en.ts` with the smallest possible
  change. Do not touch `src/renderer/features/sync-scroll/**`,
  `src/renderer/features/views/**` or the slice-9 files: another lane
  works there.
- No new dependencies. Diffing runs off the renderer's main thread if the
  documents are large (follow the render worker's pattern).

## Done means
- Unit tests for the view state; one e2e spec that opens two fixtures
  (use `test/fixtures/compare/**`) and checks a highlighted change.
- Every criterion you implemented is switched to `status: implemented`
  with its test named; nothing else changes status.
- `npm run verify` passes. No test budget is widened, no retries added.
