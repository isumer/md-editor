# Slice 10 line-diff anchors fix - prove the anchor and work guards (dev lane)

Base: main (continues the PR branch feature/slice10-line-diff-anchors)

The Vision gate on candidate 7f02cde found two Major proof gaps and one
Minor scope gap. The module is correct. This fix adds the two missing
tests and authorises one test-file update that the API change requires.
Do not change the module.

## Findings
1. Major - `src/shared/diff/lineDiff.ts:93`. Using the raw line text as
   the anchor key leaves all 15 line-diff tests green. Large diffs with
   `ignoreCase` then lose their anchors and fall back to coarse hunks.
2. Major - `src/shared/diff/lineDiff.ts:214`. Removing the work check
   inside the matching-line loop leaves the named work-bound test green;
   the other check catches that input later. A final matching run inside
   one gap can cross `MAX_WORK` and still return an exact result.
3. Minor - `test/unit/wordDiff.test.ts:33`. The diff changes this file,
   but the slice brief allows only `lineDiff.ts` and `lineDiff.test.ts`.
   The change is necessary: `diffLines` now returns `{ hunks, limited }`.

## Allowed files
`test/unit/lineDiff.test.ts`, `test/unit/wordDiff.test.ts`.

Nothing else. A temporary edit to `src/shared/diff/lineDiff.ts` is
allowed only for the red evidence below. Restore it before you commit:
the final diff must contain the two test files only. Keep the
`.hunks` update in `test/unit/wordDiff.test.ts`.

## Tests to add (red first)
Add both tests to `test/unit/lineDiff.test.ts`, in the same style as
their neighbours, each tagged with its criterion id. Keep both work
checks in the loop. Do not change `MAX_WORK`. Use no timer.

### 1. AC-R14-10: keeps sparse changes exact with normalised anchors
- `left` is 200,000 lines `Line-${index}`.
- `right` is the same array, with every 100th line replaced by
  `other-${index}`. Every other line is `left[index].toLowerCase()`.
- Call `diffLines(left, right, { ignoreCase: true })`.
- Assert exactly 2,000 change hunks. Assert each change hunk has one
  `modified` line. Assert `limited` is false.

The anchors match only after `normalized()`. A raw key finds no anchor,
makes one coarse hunk and sets `limited` true.

### 2. AC-R14-11: limits work inside one matching run
- `run` is `Array.from({ length: 1_000_000 }, () => "m")`.
- `left` is `["a1", "D", ...run, "a2", "T1"]`.
- `right` is `["a1", "E", ...run, "a2", "T2"]`.
- Assert `diffLines(left, right, {}).limited` is true.

The `a2` anchor splits the input. The gap before it holds `D` plus the
1,000,000-line run against `E` plus the same run. Its final matching run
reaches both gap ends in one diagonal. Only the in-run check stops it.
The other check never runs, because the exact result returns first.

## Red evidence
Run each mutation alone, then restore the line.
1. Replace line 93 with `const key = lines[index] as string;`.
   Run `npx vitest run test/unit/lineDiff.test.ts`.
   Test 1 must fail. The other tests must pass.
2. Delete line 214 only.
   Run `npx vitest run test/unit/lineDiff.test.ts`.
   Test 2 must fail. The other tests must pass.
3. Restore both lines. Run the file again: every test passes.

Paste both red runs and the green run.

## Done means
- `git diff --stat origin/main...HEAD` names only the two test files
  (plus the commit itself).
- `npm run typecheck`, `npm run test:unit` and `npm run check:coverage`
  exit 0; paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait more
  than 10 minutes for it.
- Commit on the PR branch with a message that names the two tests and
  the two guarded lines. Do not amend or rebase the existing commits.
