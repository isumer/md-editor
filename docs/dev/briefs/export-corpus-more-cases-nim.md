# Export fixtures: five more deterministic cases (nim)

Base: main. Fixture-only; change no product code and no test.

## Task

`test/fixtures/export/` holds the deterministic inputs for the slice 13
export tests (HTML export, PDF export). It lacks cases the export
tests will need. Add five new plain-Markdown fixtures, LF endings,
UTF-8, each fully deterministic:

1. `front-matter.md` — leading `---` YAML block with `title:` and
   `tags:`, then two headings and a paragraph. State whether a leading
   fence-like block is present on line 1; export must treat it as text
   unless a later product rule says otherwise — record that open
   question in the README row, do not decide it here.
2. `crlf-document.md` — the same content as an existing short fixture
   with CRLF bytes (`crlf-lines.md` name); note in the README that the
   file needs a `.gitattributes` review — do NOT edit `.gitattributes`
   yourself; flag it in the report.
3. `html-comments.md` — Markdown comments `<!-- -->` between
   paragraphs, plus an `<img src="x" onerror="alert(1)">` raw tag the
   sanitiser must clean.
4. `nested-lists.md` — three nesting levels, mixed ordered/unordered,
   one loose item containing a paragraph and a code span.
5. `entity-code.md` — HTML entities (`&amp;`, `&lt;script&gt;`) in
   text and inside a fenced block that must stay literal.

For each file, add one row to the "Files and exact contents" table in
`test/fixtures/export/README.md` with exact, countable facts (counts
of headings, blocks, entities), the same style as the existing rows.
Recount every fact in your row against the file bytes before you
commit.

## Allowed files

- `test/fixtures/export/**` (new `.md` files and the README table only)

## Done means

- Five new files plus five README rows; every counted fact verified.
- `npm run verify` green (locked npm) — fixtures must not break any
  check (`check:licenses`, `check:deps` included).
- Report lists each file, its facts, and any flag (CRLF handling,
  front-matter question).
