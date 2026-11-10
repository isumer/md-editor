# Slice 11 — merge view, part 1 (dev lane)

Base: main

Goal: the first user-visible part of R15 (docs/acceptance/R15-merge.md):
open a file with conflict markers and resolve it in a merge view. The
pure modules already on main do the work:
`src/shared/merge/conflictMarkers.ts`, `src/shared/merge/mergeChunks.ts`.

## Scope
- Read R15 and pick the criteria that "open a conflicted file, take left /
  right / both per conflict, save the result" needs. Leave the rest for
  later parts; list which criteria you took in the PR text.
- New code goes under `src/renderer/features/merge/**` and its tests.
- Registration (command, menu, message strings) may touch the existing
  registry and `src/shared/messages/en.ts` with the smallest possible
  change. Do not touch `src/renderer/features/compare/**` (another lane
  builds it now), `src/renderer/features/sync-scroll/**` or
  `src/renderer/features/views/**`.
- Saving goes through the existing document save path; no new IPC unless
  a criterion needs it, and then the smallest one.
- No new dependencies.

## Done means
- Unit tests for the merge state; one e2e spec with a fixture from
  `test/fixtures/merge/**` that resolves a conflict and saves.
- Every criterion you implemented is switched to `status: implemented`
  with its test named; nothing else changes status.
- `npm run verify` passes. No test budget is widened, no retries added.
