# Side — Chunk-boundary Markdown fixtures

**Base: main.** Runs alongside the development lane. This task touches only
`test/fixtures/markdown-boundaries/**`, so it is file-disjoint from slice 5
(`src/**`, `test/unit/**`, `test/e2e/**`), slice 4 fix 2
(`src/renderer/**`, preview tests), the log generator
(`test/fixtures/log/**`), the stability fixtures
(`test/fixtures/stability/**`) and the find/replace fixtures
(`test/fixtures/find-replace/**`).

The preview pipeline parses documents in chunks. A chunked or incremental
render must give the same result as a full render (Code Review Standards
§3.4). These small documents each cross one known boundary. They are
inputs only: a test renders the whole document and its chunks and compares
the output. Do not commit expected HTML.

## Deliverables (all under `test/fixtures/markdown-boundaries/`)
- `reference-definition-last.md` — one reference-link use, then 30 filler
  lines, then the matching definition as the last line.
- `loose-list.md` — a 20-item list with a blank line between items, then one
  paragraph.
- `indented-code-blank-line.md` — a four-space indented code block that
  contains one blank line, then a paragraph.
- `opened-fence.md` — an opening ``` fence, 40 lines of text, the closing
  fence, then a heading and a paragraph.
- `hard-break.md` — 30 lines of text, with two trailing spaces on some of
  them, then a paragraph.
- `README.md` — one table row per file: the boundary it crosses and what an
  equivalence test must compare (for example, "each line of the chunked
  render must equal the same lines of the full render").
- Every file: ASCII, LF only, one final LF, under 2 KB.

Do not invent extra files. Do not touch `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/markdown-boundaries -type f | sort` and
  `wc -c` for each file.
- Paste `file` output for every file. Each must report ASCII text and must
  not report CRLF.
- Paste the count commands that prove the boundary: the definition is the
  last line; the list has 20 items and 19 blank lines between them; the
  code block has one blank line; the fence text has exactly two ``` lines;
  the hard-break file has the stated number of lines with two trailing
  spaces.
- Negative control: with a throwaway probe (do not commit it), render one
  file with the project's `renderMarkdown` as a whole and as two halves.
  The module is TypeScript; a temporary spec under `test/unit/` run with
  `npx vitest run <spec> --coverage=false` is allowed for the probe, then
  delete the spec and the JUnit output. Paste both outputs. The probe must
  show a case where a half rendered alone differs from the whole; if no
  file shows a difference, say so and do not change the fixture to force
  one.
- `npm run verify` stays green (fixture-only).

## Allowed files
`test/fixtures/markdown-boundaries/**` only. Nothing else — no src, no
test/unit, no test/e2e, no docs, no coverage config, no workflows.

## Done means
list changed files; paste sizes; paste `file` output; paste every count
command and its output; paste the negative-control output; paste
`npm run verify` output.
