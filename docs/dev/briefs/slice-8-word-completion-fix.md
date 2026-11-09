# Slice 8 word completion fix - code points and missing proof (dev lane)

Base: main (continues the PR branch feature/slice8-word-completion)

The Vision gate on candidate aad8ad9 found three confirmed gaps. This
fix makes the module scan Unicode code points and adds the three
missing tests. Do not change the module's other rules. Do not add
wiring, IPC or dependencies.

One gate finding is disputed and needs no work: the AC-PERF-09 frame
on this Raspberry Pi is information only (see the standing note in the
pipeline). The candidate CI run 42334033298 is green on ubuntu,
windows and macOS. Do not tune or loop on Pi perf numbers.

## Findings
1. Major - `src/shared/text/wordCompletion.ts`. `isWordChar` tests one
   UTF-16 code unit at a time. A non-BMP letter is a surrogate pair;
   each half matches no `\p{L}` class. `wordAt('a𐐀b', 3)` returns
   `{ prefix: '', start: 3 }` instead of `{ prefix: 'a𐐀', start: 0 }`.
   `completeWord` finds no non-BMP word. The brief says a word
   character is a Unicode letter.
2. Major - the brief's `wordAt` test must cover a prefix of length 1.
   It does not. Mutating `clampedOffset === 0` to `<= 1` leaves all 13
   tests green.
3. Major - rule 5's default limit of 20 has no test. Mutating the
   default from 20 to 2 leaves all 13 tests green.
4. Minor - both files end without a final newline. Every neighbouring
   file ends with one.

## The module change
A character is one Unicode code point, not one UTF-16 code unit.

- A word character is a code point that matches `/\p{L}|\p{N}|_/u`.
  A lone surrogate is not a word character, as today.
- `wordAt`: clamp as today. Then, if the clamped offset splits a
  surrogate pair (a high surrogate ends at it and a low surrogate
  starts it), use the offset of the pair's first code unit instead.
  This is the rule of `src/shared/lines/columnEditor.ts:49`. The
  character before the cursor is then the code point that ends at
  that offset. Scan back over code points. `start` and `prefix` stay
  UTF-16 code unit offsets, as today.
- `completeWord`: scan forward by code point. A run is a maximal
  sequence of word code points. The cursor word is the run found by
  `wordAt`. Keep the candidate rule as it is: run length in UTF-16
  code units greater than the prefix length, lowercased prefix match,
  first spelling kept, at most `maxWords` words.

## Tests to add (red first)
Add these to `test/unit/wordCompletion.test.ts`, in the style of the
existing tests. Keep every existing test unchanged, except the one
named below.

1. In `finds the word before the cursor`, add
   `expect(wordAt(text, 1)).toEqual({ prefix: 'h', start: 0 })`.
2. `handles non-BMP letters` - add three assertions with the Deseret
   letters below (U+10400 and U+10428):
   - `wordAt('a𐐀b', 3)` equals `{ prefix: 'a𐐀', start: 0 }`.
   - `wordAt('𐐀b', 1)` equals `{ prefix: '', start: 0 }` (the offset
     splits the pair; it acts as the pair's start).
   - `completeWord('𐐀𐐨x 𐐀𐐨xyz', 5)` equals `['𐐀𐐨xyz']`.
3. `defaults to at most 20 words` - build `ite` plus 21 words `item0`
   through `item20`, cursor after `ite`. Assert the result has
   exactly 20 entries, ends with `item19`, and does not contain
   `item20`.

## Red evidence
Run each step alone, then restore.
1. Before the module change: run the new tests. The non-BMP
   assertions and the default-20 test must fail. The one-character
   assertion passes; its proof is step 2.
2. Mutate `clampedOffset === 0` to `<= 1`. The one-character
   assertion must fail; every other test passes.
3. Mutate the default `maxWords` from 20 to 2. The default-20 test
   must fail; every other test passes.
4. Break the code-point scan in one line (for example, advance by one
   code unit where the fix advances past a pair, or drop the pair
   check). The non-BMP assertions must fail; every other test passes.
5. Restore everything. The whole file passes.

Paste all runs.

## Formatting
Add the final newline to both files. Do not change the quote style:
the single quotes match `lineEndings.ts`, `language.ts` and the
neighbouring test files.

## Allowed files
`src/shared/text/wordCompletion.ts`,
`test/unit/wordCompletion.test.ts`. Nothing else.

## Done means
- `git diff --stat origin/main...HEAD` names only the two files.
- `npm run typecheck`, `npm run check:deps`, `npm run test:unit`
  exit 0; paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait
  more than 10 minutes for it. If AC-PERF-09 fails on this machine,
  note the number and move on.
- Commit on the PR branch. Do not amend or rebase existing commits.
