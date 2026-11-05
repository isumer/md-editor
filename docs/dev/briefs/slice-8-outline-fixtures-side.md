# Side — Slice 8 outline and document-map fixture

**Base: main.** Starts from `main` and runs alongside the current slices.
Owned files: only `test/fixtures/outline/**`. This set is disjoint from
every queued or running item: slice 4 fix-2 and slice 5 own `src/**` and
the test suites, side/040 owns `test/fixtures/powertools/**`, and the NIM
task owns `test/fixtures/stability/**`.

Slice 8 (PLAN "Slices" §8) has an outline and a document map. Both read
headings from Markdown. This task gives them one deterministic document
and the exact expected outline. Slice 8 tests then assert the heading
tree, the levels and the line numbers. They do not re-derive them.

## Deliverables (all under `test/fixtures/outline/`)

- `outline.md` — a deterministic UTF-8 Markdown document, LF endings, no
  trailing spaces, exactly one newline at the end. It must contain:
  - ATX headings at levels 1 to 4, including one closed heading
    (`## Closed heading ##`) and one heading with inline code;
  - one setext heading (a text line followed by a line of `===`);
  - one duplicate heading text at two different lines;
  - one non-ASCII heading (`Türkçe başlık`);
  - one fenced code block that contains a line starting with `#`; that
    line must not appear in the outline;
  - body text under each heading so the heading line numbers are stable.
- `README.md` — one short paragraph: what the fixture is for, that it is
  deterministic, and that it must not be reformatted. Then one exact table
  with the expected outline: 1-based line number, level, and heading text
  as an outline would show it (markers and closing hashes removed). Add
  one line that says the `#` line inside the fenced block is not in the
  outline, with its line number and why.

## Rules
- The README table must match `grep -n '^#' outline.md` plus the setext
  heading line. Do not write an expected value you did not read back from
  the file.
- No generated data at test time. No clock, no randomness, no symlinks,
  no NUL bytes.
- Do not touch any other file.

## Verify
- Paste `find test/fixtures/outline -type f` output.
- Paste `grep -n '^#' test/fixtures/outline/outline.md` output next to the
  README table, and show that every table line has the same line number
  and text.
- Paste `wc -l test/fixtures/outline/outline.md` and `od -An -c` of the
  last 16 bytes to show the single final LF.
- `npm run verify` stays green (fixture-only change).

## Done means
The file list, the `grep -n`, `wc -l` and `od` output, the README table,
and the `npm run verify` output are in the report.
