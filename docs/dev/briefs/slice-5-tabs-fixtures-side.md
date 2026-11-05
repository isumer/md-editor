# Side — Slice 5 tabs fixtures (two deterministic documents)

**Starts from `main`** and runs alongside the current slices. File-disjoint
from every queued or running slice: slice 4 fix and slice 5 touch `src/**`,
`test/unit/**` and `test/e2e/**`; the export task touches
`test/fixtures/export/**`; the binary task `test/fixtures/binary/**`. This
task touches only `test/fixtures/tabs/**`.

Slice 5 ("Tabs + safety", PLAN "Slices" §5) proves that each tab keeps its
own text, undo history, cursor and scroll (AC-R4-01), that only the dirty tab
is marked (AC-R4-03), and that close prompts/quit act per document
(AC-R4-05/06). Those e2e tests need stable files with known, line-addressable
content so a test can scroll to a marker, edit, switch tabs and assert exact
text. This task commits them; it does not write the tests.

## Deliverables (all under `test/fixtures/tabs/`)
- `README.md` — one short paragraph (what the fixtures are for, that they are
  committed and deterministic), then a table with one row per file: what it
  contains and what a tab test should assert for it.
- `alpha.md` — Markdown with a `# Alpha` heading, a paragraph, 30 lines each
  carrying a unique token `alpha-line-01` … `alpha-line-30`, one fenced code
  block and one bullet list. Long enough to scroll.
- `beta.md` — same shape with `# Beta` and tokens `beta-line-01` …
  `beta-line-30`, different word order and different heading text, so a test
  can tell the two tabs apart by text alone.
- `plain.txt` — 20 plain-text lines `plain-line-01` … `plain-line-20`, no
  Markdown, to prove a non-Markdown document opens in a tab too.
- `crlf.md` — a small Markdown file with CRLF line endings and no BOM
  (distinct from `test/fixtures/encodings/crlf.txt`, which slice 7 uses for
  round-trip saves): a tab test must assert the saved EOL stays CRLF. Write
  it with `printf`/Node, not an editor that may normalise it.

All files: UTF-8 without BOM, ASCII-only content (except the CRLF line
endings in `crlf.md`), LF elsewhere, each under 4 KB. Do not create folders
or extra files; do not touch the root `.gitattributes` or `.gitignore`.
The line markers must appear exactly once per file and in order.

## Verify
- Paste `find test/fixtures/tabs -type f | sort` and the first/last three
  lines of each file.
- Negative control: `grep -c 'alpha-line-' alpha.md` is 30, likewise
  `beta-line-` 30 and `plain-line-` 20; `file test/fixtures/tabs/crlf.md`
  reports CRLF line terminators and every other file reports no CRLF. Paste
  both outputs.
- `npm run verify` stays green (fixture-only change; the existing suite runs
  untouched).

## Allowed files
test/fixtures/tabs/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files (`find` output); paste the marker counts, the `file` output and
`npm run verify` output.
