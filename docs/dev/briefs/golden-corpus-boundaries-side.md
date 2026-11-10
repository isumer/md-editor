# Golden corpus: add the chunk-boundary cases (side)

Base: main. Fixture-only; change no product code.

## Task

The golden render corpus (`test/fixtures/golden/`) proves the plain
render path byte-exactly. It does not cover the Markdown constructs
that cross chunk boundaries in the incremental path (review guide
§3.4): a reference defined after its use, a loose list, indented code
with a blank line inside, an unclosed fence at document end, a nested
list block, and a table directly after a paragraph. Add one new `.md`
+ `.html` pair per case, six pairs in total.

Rules (from `test/fixtures/golden/README.md`):

- Each `.html` is the exact output of
  `sanitizeRenderedHtml(renderMarkdown(markdown))`, `data-line`
  0-based. Generate it with the current renderer, then read it and
  confirm it renders the case's visible meaning; never copy from an
  external renderer.
- Add a new pair only: do not edit any existing `.md` or `.html`.
- Add each new name to the `fixtures` list in
  `test/unit/goldenRender.test.ts`, and one row per pair to the Pairs
  table in `test/fixtures/golden/README.md` naming the guard.
- Negative control (guide §4): corrupt one new `.html` (add one
  character), run `npm run test:unit -- goldenRender` (locked npm),
  show it red, restore, show it green. Put the command and both
  outcomes in your report.

## Allowed files

- `test/fixtures/golden/**` (new pairs and the README table only)
- `test/unit/goldenRender.test.ts` (the name list only)

## Done means

- `npm run test:unit` green with the six new pairs (locked npm).
- The negative control shown red then green in the report.
- No file outside the allowed list touched.
