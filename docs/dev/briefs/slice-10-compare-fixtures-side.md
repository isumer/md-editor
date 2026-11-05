# Side — Slice 10 compare fixtures (deterministic file and folder pairs)

**Starts from `main`** and runs alongside slice 4. File-disjoint from every
queued or running slice (slice 4 touches `src/**`, `test/unit/**`,
`test/e2e/**`; side/023 `test/fixtures/source/**`; side/026
`test/fixtures/workspace/**`; side/028 `test/fixtures/merge/**`): this task
touches only `test/fixtures/compare/**`.

Slice 10 (compare files and folders, PLAN "Slices" §10 and the "Compare files
and folders" section) needs known inputs with written-down expected outcomes
for its line diff, word-level diff, ignore options and folder compare.

## Deliverables (all under `test/fixtures/compare/`)
- `README.md` — what the fixtures are for, that they are committed and
  deterministic, and for each pair the exact expected result (below), so
  slice 10's tests assert against it without re-deriving it.
- `lines/left.txt`, `lines/right.txt` — ~30 lines, ASCII, LF. From left to
  right: one changed line, one inserted block of two lines, one deleted line,
  and one moved-looking edit (a line deleted in one place and added
  elsewhere). README lists every hunk as `left a-b → right c-d` (1-based).
- `words/left.txt`, `words/right.txt` — three lines each where only one word
  per line changes (incl. one line where punctuation changes and one with a
  Turkish word, UTF-8), README names each changed word range.
- `whitespace/left.txt`, `whitespace/right.txt` — differ only in trailing
  spaces, indentation (tabs vs spaces) and letter case on separate lines.
  README states: identical with "ignore whitespace" + "ignore case", and
  which lines differ with each option alone.
- `line-endings/lf.txt`, `line-endings/crlf.txt` — same text, LF vs CRLF.
  Add `test/fixtures/compare/.gitattributes` with `* -text` so git keeps the
  bytes (check them with `od -c | head`).
- `identical/a.md`, `identical/b.md` — byte-identical Markdown.
- `folders/left/`, `folders/right/` — a small tree (≤ 12 files, one nested
  subfolder) with: a file only on the left, a file only on the right, a
  changed file, an identical file, a file identical except line endings,
  and a same-named entry that is a file on one side and a folder on the
  other. README lists every relative path with its expected status
  (`left-only`, `right-only`, `changed`, `identical`, `type-mismatch`).
- No symlinks, no binaries (a NUL byte counts as binary), no files > 4 KB.

## Verify
- Paste `find test/fixtures/compare -type f | sort` and `diff -u` of
  `lines/left.txt` `lines/right.txt`; show that its hunks match the README.
- Negative control: `diff -r test/fixtures/compare/folders/left
  test/fixtures/compare/folders/right` and show its output agrees with the
  README status list (every path accounted for).
- `npm run verify` stays green (fixture-only change).

## Allowed files
test/fixtures/compare/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no root `.gitattributes`, no coverage config, no
workflows.

## Done means
list files (the `find` output); paste the `diff -u` and `diff -r` output
next to the README tables; paste `npm run verify` output.
