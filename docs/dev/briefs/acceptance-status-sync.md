# Sync acceptance status with tests already on main (dev lane)

Base: main

Slices merged code and tests that cover acceptance criteria, but the
criteria were left `status: planned`. Progress is under-reported, and the
area jobs may redo finished work.

## Scope
1. For every `status: planned` criterion in `docs/acceptance/*.md`, find
   tests on main that name it (`AC-<area>-<n>` in a test title or tag).
2. Switch it to `status: implemented` only if that test really asserts
   the criterion as written (the behaviour and its threshold, not a
   nearby one) and passes. Name the test next to the status, as the
   implemented criteria already do.
3. Where a test exists but asserts less than the criterion, leave it
   planned and list the gap in the PR text.
4. Change only `docs/acceptance/*.md`. No code, no test changes.

## Done means
- Every status change has its test named and the test passes locally
  (`npm run check:acceptance` and the named tests).
- The PR text lists each criterion switched and each one left planned
  with its gap.
