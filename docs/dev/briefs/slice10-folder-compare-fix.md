# Slice 10 folder compare fix — prove the right-only error branch (send-back of gate 958)

Work on branch `feature/slice10-folder-compare` (tip `e71c58e`). Run
`git merge origin/main` first. Change no behaviour. Add no dependency. Add
no new file.

Base: feature/slice10-folder-compare (a send-back continues its own PR
branch).
Depends on: main only.

## State of the branch
The module and its tests are correct except for one proof gap. Typecheck,
check:deps and test:unit pass. AC-R14-12, -14 and -15 stay `planned`.

## Allowed files
- `test/unit/folderCompare.test.ts`
- `src/shared/diff/folderCompare.ts` (only if the new test shows a defect)

Change no other file.

## Finding 1 (Major) — the right-only unreadable-file branch has no proof
`src/shared/diff/folderCompare.ts:125` returns `error` for a file that is
present only on the right and has `error` set. No test has such an entry.
Evidence: change the line to `const status = "right-only";`. All 12 tests
stay green. Rule 7 of the module brief requires the `error` status.

### Fix
- In `AC-R14-12: reports an unreadable entry as error`, add one file that
  is present only on the right and has `error` set (for example
  `right-single-error.md`).
- The `expect(statuses(rows)).toEqual({...})` assertion must include that
  path with the exact status `error`.
- Keep the existing left-only and both-sides error cases.

### Red evidence (required)
1. Change line 125 to `const status = "right-only";`. Run
   `npx vitest run test/unit/folderCompare.test.ts --coverage.enabled=false`.
   The test must fail and name `right-single-error.md`. Paste the failure.
2. Restore the line. Run the test again. It must pass. Paste the summary.

## Done means
`npm run typecheck`, `npm run check:deps` and `npm run test:unit` exit 0.
Paste the three outputs and the red evidence. List the changed files. Do
not change the coverage baseline, acceptance files or workflows.
