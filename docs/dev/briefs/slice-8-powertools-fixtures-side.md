# Side — Slice 8 power-tools fixtures (deterministic sort/dedupe + column text)

**Starts from `main`** and runs alongside the current slices. File-disjoint
from every queued or running slice (slice 4/4-fix and slice 5 touch
`src/**`, `test/unit/**`, `test/e2e/**`; side/030 `test/fixtures/compare/**`;
side/032 `test/fixtures/grep/**`; side/028 `test/fixtures/merge/**`; side/023
`test/fixtures/source/**`; side/026 `test/fixtures/workspace/**`): this task
touches only `test/fixtures/powertools/**`.

Slice 8 (power tools, PLAN "Slices" §8) tests "sort + dedupe on a 100k-line
file < 300 ms and undoable in one step" and the column editor on fixed-width
text. This task provides deterministic inputs with written-down expected
outcomes so slice 8's tests assert exact results instead of re-deriving them.

## Deliverables (all under `test/fixtures/powertools/`)
- `generate.mjs` — a self-contained Node script (no dependencies) that writes
  a deterministic plain-text file of `N` lines (LF, ASCII, one record per
  line) from a fixed seed/pattern: no `Date`, no `Math.random`, no
  locale-dependent formatting. Usage: `node test/fixtures/powertools/generate.mjs
  <lines> <path>`. Exactly the requested number of lines. The content must
  include a known, documented number of exact duplicate lines (so a dedupe
  has a well-defined result) and varied line lengths.
- `sort-dedupe.txt` — a committed small deterministic sample (200 lines,
  written by `generate.mjs 200`), so slice 8 can assert an exact sorted
  order and an exact dedupe count on a file small enough to read in a test.
- `column.txt` — a small fixed-width text file (all lines the same byte
  length, LF) with a few blank-padded columns, for column-editor tests.
- `README.md` — one short paragraph: what the fixtures are for, that they are
  deterministic, how to regenerate `sort-dedupe.txt`, and the exact expected
  outcomes written down so slice 8 does not re-derive them:
  - for `sort-dedupe.txt`: line count, unique count, first and last three
    lines of the sorted output, and the number of duplicates removed;
  - for the 100k-line file (generated at test time, never committed): its
    exact line count, unique count, and SHA-256 of the output for
    `generate.mjs 100000` (slice 8 generates it at test time, so it is never
    committed — mirrors `test/fixtures/big`).

## Verify
- Run `node test/fixtures/powertools/generate.mjs 200 /tmp/sd.txt` and `cmp`
  it against the committed `sort-dedupe.txt`; paste the diff/cmp output.
- Run `node test/fixtures/powertools/generate.mjs 100000 /tmp/big.txt`, show
  `wc -l`, `sort -u | wc -l` and `sha256sum`, and paste them next to the
  README numbers (they must match).
- Negative control: sort `sort-dedupe.txt` with `sort` and `sort -u` and show
  the outputs match the README's written-down sorted first/last lines and
  unique count.
- `npm run verify` stays green (fixture-only change).

## Allowed files
test/fixtures/powertools/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files (the `find` output); paste the `cmp`, `wc -l`/`sort -u`/`sha256sum`,
and `sort`/`sort -u` outputs next to the README tables; paste `npm run verify`
output.
