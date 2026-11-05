# Side — READMEs for the encodings, source and golden fixtures

**Base: main.** New files only. This task is file-disjoint from every
queued item: slice 4 fix (`src/renderer/**`, preview tests), slice 5
(`src/**`, `test/unit/**`, `test/e2e/**`), replace-in-files fixtures
(`test/fixtures/replace-in-files/**`), the git round-trip fixture
(`test/fixtures/merge/**`) and the compare fixtures
(`test/fixtures/compare/**`).

Three fixture folders have no README:

- `test/fixtures/encodings/` (5 data files)
- `test/fixtures/source/` (2 data files)
- `test/fixtures/golden/` (10 `.md`/`.html` pairs)

Slice 7 and slice 4 tests assert exact bytes, lines and HTML. A test author
must find these facts in the READMEs, not re-derive them. Write one README
per folder. Do not change any fixture data file.

## Deliverables

### `test/fixtures/encodings/README.md`

One short introduction and one table. One row per file: file name, byte
size, encoding, line endings, BOM, the text the file holds, and the
encoding name a detection test must report. The files are `binary.bin`,
`crlf.txt`, `utf16le.txt`, `utf8-bom.txt` and `windows-1254.txt`.

Derive every fact from the bytes. Run these commands and use their output:

- `file test/fixtures/encodings/*`
- `wc -c test/fixtures/encodings/*`
- `od -An -tx1 -N 32 <file>` for each file, to show the BOM bytes or the NUL byte.

State the exact Turkish text in `windows-1254.txt`; it must contain
`ğüşıöç`. For `binary.bin`, state the byte offset of the first NUL byte and
whether the offset is 0-based or 1-based. State the minimum scan length a
detector needs to see that NUL byte.

### `test/fixtures/source/README.md`

One table row per file (`java.java`, `python.py`): language, comment marker
for toggle-comment, and 1-based line numbers for one keyword token, one
string token, one comment token, and the first and last line of the block
that folding must fold. Add one line that both files are ASCII with LF
endings.

### `test/fixtures/golden/README.md`

State these rules:

- Each `.md` file is a rendered input.
- Each `.html` file is the exact expected output of
  `sanitizeRenderedHtml(renderMarkdown(markdown))`.
- `data-line` attributes are 0-based input line numbers of the block.
- `test/unit/goldenRender.test.ts` compares the output byte-exactly.
- Never regenerate a golden file to make a test pass. A change to a `.html`
  file needs a `Protected-change` reason in the commit message.

Add one table row per pair: input file, what it covers (taken from its
content), and the behaviour its HTML guards.

## Rules

- READMEs are ASCII with LF line endings.
- Do not edit data files, tests, src, config or other briefs.
- Do not add a generator.
- Every count, offset and line number must come from a command. Paste the
  command and its output in the task report.
- Use short sections and short sentences.

## Verify

- List the changed files.
- Paste `git diff --stat`.
- Paste the commands and output that back the byte sizes, encodings, BOM
  and NUL offsets, and line numbers.
- `npm run verify` stays green (docs only; no test change).

## Allowed files

`test/fixtures/encodings/README.md` (new), `test/fixtures/source/README.md`
(new), `test/fixtures/golden/README.md` (new). Nothing else.

## Done means

List the changed files. Paste the evidence commands and their output. Paste
the `npm run verify` output.
