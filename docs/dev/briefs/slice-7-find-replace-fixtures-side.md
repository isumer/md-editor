# Side — Slice 7 find/replace fixtures

**Base: main.** Runs alongside the development lane. This task touches only
`test/fixtures/find-replace/**`, so it is file-disjoint from slice 5
(`src/**`, `test/unit/**`, `test/e2e/**`), slice 4 fix 2
(`src/renderer/**`, preview tests), the log generator
(`test/fixtures/log/**`) and the stability fixtures
(`test/fixtures/stability/**`).

Slice 7 (PLAN "Slices" §7) adds find/replace and Find in Files. These are
committed text fixtures with exact, countable matches. A test must use them
to prove the match rules; the README gives the counts.

## Deliverables (all under `test/fixtures/find-replace/`)
- `mixed-case.md` — the words `Cat`, `cat`, `CAT`, `cAt` and the substring
  `catalog`, each a known number of times.
- `whole-words.md` — the word `cat` several times, plus `cats`, `copycat`
  and `concatenate`, each a known number of times.
- `regex-meta.md` — literal text that contains `. * + ? [ ] ( ) { } ^ $ |
  \` and the literal string `a.c`, each a known number of times.
- `unicode.md` — UTF-8 text with the Turkish letters `ğüşıöç` and the pair
  `İ`/`i`, each a known number of times. All other files are ASCII.
- `README.md` — one table row per file: the exact counts a test must assert
  (whole-word matches, substring matches, case-insensitive matches) and the
  command used to count them. State that all files are LF only.
- All files end with one LF. No file is larger than 2 KB.

Do not invent extra files. Do not touch `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/find-replace -type f | sort` and `wc -c` for
  each file.
- For every count in the README, paste the `grep -c` (or `grep -o | wc -l`)
  command and its output. The counts in the README must equal the outputs.
- Negative control: show that one wrong count is detected. Copy a file to a
  temp path, change one match, and paste the count command giving a
  different number. Remove the temp file.
- `npm run verify` stays green (fixture-only).

## Allowed files
`test/fixtures/find-replace/**` only. Nothing else — no src, no test/unit,
no test/e2e, no docs, no coverage config, no workflows.

## Done means
list changed files; paste sizes; paste every count command and its output;
paste the negative control; paste `npm run verify` output.
