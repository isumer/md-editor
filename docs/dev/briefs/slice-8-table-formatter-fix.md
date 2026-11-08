# Slice 8 table formatter fix - two escape rules have no proof (dev lane)

Base: main (continues the PR branch feature/slice8-table-formatter)

The Vision gate on candidate ef7c037 and the fallback review found two
untested rules in the escaped-pipe handling. The module code is correct;
the tests do not prove it. This fix adds two tests. Do not change the
module. Do not add wiring, IPC or dependencies. AC-R13-07 stays
`planned`.

## Base race
If a lane starts you on another branch from origin/main, merge
`origin/feature/slice8-table-formatter` into it (no rebase, no
force-push). The branch name alone is not a scope finding at the next
review.

## Findings
1. Major - `src/shared/format/tableFormat.ts:16`. Split rule 4 says: a
   pipe is a separator when an even number (including zero) of
   backslashes comes directly before it. Every test uses at most one
   backslash. The gate proved it: changing
   `backslashCount % 2 === 1` to `backslashCount > 0` leaves all 8
   tests green. A pipe after two backslashes is then kept inside its
   cell, which breaks the rule.
2. Major - `src/shared/format/tableFormat.ts:24`. Split rule 3 says: a
   trailing pipe is dropped only when it is not escaped. No test has a
   row that ends with an escaped pipe. The fallback review proved it:
   changing `content.endsWith("|") && !isEscapedPipe(...)` to
   `content.endsWith("|")` leaves all 8 tests green. The escaped
   trailing pipe is then dropped from its cell, which breaks the rule.

## The new tests
Add these two tests to `test/unit/tableFormat.test.ts` inside the
existing `describe` block. Change nothing else in the file.

Test 1, title `AC-R13-07: treats a pipe after an even backslash run as
a separator`:

```ts
it("AC-R13-07: treats a pipe after an even backslash run as a separator", () => {
  expect(
    formatTable(["| a \\\\| b | c |", "| - | - | - |", "| x | y | z |"]),
  ).toEqual([
    "| a \\\\ | b   | c   |",
    "| ---- | --- | --- |",
    "| x    | y   | z   |",
  ]);
});
```

The header row is `| a \\| b | c |` with two backslashes before the
second pipe. That pipe is a separator, so the row has three cells and
the first cell text is `a \\` (a, space, backslash, backslash), padded
to width 4.

Test 2, title `AC-R13-07: keeps an escaped pipe at the end of a row`:

```ts
it("AC-R13-07: keeps an escaped pipe at the end of a row", () => {
  expect(formatTable(["x | a \\|", "- | -"])).toEqual([
    "| x   | a \\| |",
    "| --- | ---- |",
  ]);
});
```

The header row is `x | a \|`. Its trailing pipe is escaped (one
backslash), so rule 3 keeps it. The row has two cells and the second
cell text is `a \|` (a, space, backslash, pipe), width 4.

## Red evidence
1. Before adding the tests, mutate `tableFormat.ts:16`
   `backslashCount % 2 === 1` to `backslashCount > 0`. Run the test
   file. Test 1 must fail and the original 8 tests must pass. Paste the
   run. Restore the line.
2. Mutate `tableFormat.ts:24` to `if (content.endsWith("|")) {`. Run
   the test file. Test 2 must fail and the other 9 tests must pass.
   Paste the run. Restore the line.
3. With the module restored, the whole file passes 10 tests. Paste the
   run.

The module must stay unchanged: the same hash before and after.

## Allowed files
`test/unit/tableFormat.test.ts`. Nothing else. Do not change
`src/shared/format/tableFormat.ts`.

## Done means
- The fix commit changes only `test/unit/tableFormat.test.ts`. Check
  `git diff --stat HEAD~1..HEAD`. The diff against `origin/main...HEAD`
  names the module too, because this branch continues the unmerged PR:
  that is not a scope finding.
- `npm run typecheck`, `npm run check:deps` and `npm run test:unit`
  exit 0. Paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait
  more than 10 minutes for it. If AC-PERF-09 fails on this machine,
  note the number and move on.
- Commit on the PR branch. Do not amend or rebase existing commits.
