# Close the next criteria of one requirement area (dev lane)

Base: main

The pipeline queues this brief with one area in the job text, for example
`Area: R04 (docs/acceptance/R04-tabs-and-documents.md)`. The goal is
criteria a user can see: each part moves `status: planned` criteria to
`status: implemented`.

## Scope
1. Read the area's acceptance file and the code that already exists for
   it (modules on main are often waiting for their wiring).
2. Pick the next 3–8 planned criteria that belong together and fit one
   reviewable PR (aim under about 800 changed lines). Name them in the
   PR text.
3. Stay inside the area's own feature directories and their tests.
   Shared files (registry, `src/shared/messages/en.ts`, menus, IPC) get
   the smallest possible change. The job text lists the areas running in
   parallel; do not edit their feature directories.
4. No new dependencies unless a criterion requires one; then name it,
   its licence and why in the PR text.

## Done means
- Each implemented criterion has a test that fails without the change
  (unit for logic, e2e for what the user sees) and is switched to
  `status: implemented` with that test named. Nothing else changes
  status.
- `npm run verify` passes. No test budget widened, no retry added, no
  test skipped.
- If a criterion cannot be met (needs an owner decision, real hardware,
  a signing key), leave it planned and say why in the PR text.
