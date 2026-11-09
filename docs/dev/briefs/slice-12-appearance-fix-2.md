# Slice 12 fix 2 - record the performance evidence for the appearance module (dev lane)

Base: main (continues the PR branch bug/slice12-appearance-fix)

The Vision gate on candidate 2f1b619 (job 1089) returned FIX with one
Blocker: AC-PERF-11 on this host reports 1,047 ms for the first preview
of a 20 MB file, against a 1,000 ms budget.

That budget does not apply on this host. `docs/acceptance/PERF-response-time.md`
(platform rule, lines 74 to 81) says the 20 MB rows of AC-PERF-09,
AC-PERF-10 and AC-PERF-11 run as information on the Raspberry Pi, and
must not block a merge. The CI desktop runners enforce the budgets.
Candidate 2f1b619 passed every CI leg: run 42535279306 has Test
(ubuntu-latest), Test (windows-latest), Test (macos-latest) and Package
and smoke-test Linux all green. The earlier macOS failure at 142 ms was
run 42519953874 on candidate 517204e, before the reviewed merge.

The gate also says the appearance change has no runtime path to the
failure. That is true: only the test imports the module.

Do not change the module, the test, any performance code, any test
threshold or any budget. The fix is to write the evidence into the branch
so the next gate can read it.

## Allowed files

- `docs/reviews/2026-11-09-slice12-appearance-perf-verification.md` (new file)

Change no other file. Do not add a package.

## 1. Merge current main

The lane normally merges origin/main into the branch before you start.
Check it: `git merge-base --is-ancestor origin/main HEAD; echo $?` must
print 0. If it prints 1, merge origin/main and commit the merge. Do not
rebase, amend or force-push.

## 2. Write the evidence note

The new file must state these facts, each with its proof:

- The branch adds exactly two source files against main: the module
  (+101) and its test (+203). Paste
  `git diff --stat origin/main...HEAD -- src test`.
- The module blob is `b442856daa68c06facebe223d830a5a5bc6d9ddd` and the
  test blob is `d5ea05813196cb09b4c4b539250af456f444d29c`. Paste
  `git rev-parse HEAD:src/shared/settings/appearance.ts
  HEAD:test/unit/appearance.test.ts`.
- Only the test imports the module. Paste the command
  `grep -rn "settings/appearance" src test` and its output.
- The platform rule above, with its file and line numbers.
- The CI result on 2f1b619: run 42535279306, all four jobs green. The
  earlier macOS red at 142 ms was run 42519953874 on 517204e. It does not
  reproduce on the candidate.
- One AC-PERF-11 run on this host on HEAD, with its numbers, labelled
  information only. Run the test once. Do not run a 30-sample series on
  this host: the platform rule removes that requirement here.
- The budgets stay at 32 ms, 100 ms and 1 s. State that this note does
  not change them.

## 3. Mutation evidence for the module

Paste both runs. All other tests must stay green in each run. Restore the
line after each run and show `git status --short` before the commit. Do
not commit either mutation.

1. Change `s <= 0.03928` to `s <= 0` at
   `src/shared/settings/appearance.ts:49`. `test/unit/appearance.test.ts`
   must fail at the grey 1 and grey 10 inputs. Restore the line.
2. Change `s <= 0.03928` to `s <= 0.05`. The test must fail at the grey
   11 input. Restore the line.

## Done means

- The only changes are the merge commit (only if the lane did not merge)
  and the new evidence note.
- `npm run typecheck` exits 0.
- `npm run test:unit -- test/unit/appearance.test.ts
  --coverage.enabled=false` passes 40 tests.
- `npm run check:acceptance` exits 0. AC-R7-01..04 stay planned; the
  module stays unwired.
- `npm run verify` exits 0, or exits 1 only from an informational
  AC-PERF row on this host. Paste its summary lines.
- No package is added.
