# Slice 8 word completion fix 2 - the custom limit has no proof (dev lane)

Base: main (continues the PR branch feature/slice8-word-completion)

The Vision gate on candidate 127de57 found one gap that the earlier
review accepted. This fix changes one test. Do not change the module.
Do not add wiring, IPC or dependencies.

## Finding
1. Major - `test/unit/wordCompletion.test.ts`, test "keeps document
   order and the limit". The text has two matching candidates and the
   test uses `maxWords = 2`. A constant limit of 20 gives the same
   result. The test does not prove that `completeWord` uses the
   supplied limit. The review confirmed it: changing
   `wordCompletion.ts:116` `results.length >= maxWords` to
   `results.length >= 20` leaves all 15 tests green (gate job 1024).

## The test change
Replace the body of "keeps document order and the limit" in
`test/unit/wordCompletion.test.ts`. Keep the test title. Do not change
any other test.

- Text: `'apple applet application apricot approach append banana'`.
- Cursor at offset 3, in "apple". The prefix is "app". The cursor
  word "apple" is excluded.
- Five words match: applet, application, apricot, approach, append.
  "banana" does not match.
- Assert `completeWord(text, 3, 3)` equals exactly
  `['applet', 'application', 'apricot']`. These are the first three
  matching words in document order.

## Red evidence
1. Before the test change, mutate `wordCompletion.ts:116`
   `results.length >= maxWords` to `results.length >= 20`. Run the
   test file. The test must fail and the other 14 tests must pass.
   Paste the run.
2. Restore the module. The whole file passes 15 tests. Paste the run.

The module must stay unchanged: the same hash before and after.

## Formatting
Keep the existing style and the final newline.

## Allowed files
`test/unit/wordCompletion.test.ts`. Nothing else. Do not change
`src/shared/text/wordCompletion.ts`.

## Done means
- The fix commit changes only `test/unit/wordCompletion.test.ts`.
  Check `git diff --stat HEAD~1..HEAD`. The diff against
  `origin/main...HEAD` names the module too, because this branch
  continues the unmerged PR: that is not a scope finding.
- `npm run typecheck`, `npm run check:deps`, `npm run test:unit`
  exit 0. Paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait
  more than 10 minutes for it. If AC-PERF-09 fails on this machine,
  note the number and move on.
- Commit on the PR branch. Do not amend or rebase existing commits.
