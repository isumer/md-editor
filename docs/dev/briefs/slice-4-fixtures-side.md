# Side — Slice 4 preview fixtures (large deterministic Markdown)

**Starts from `main`** and runs alongside the 3e slice. File-disjoint from
it (and from the 3d-2 / 017 reviews): this task touches only
`test/fixtures/big/**`, which no queued or running slice touches.

Slice 4 (preview pipeline, PLAN "Slices" §4) needs deterministic Markdown
fixtures for its latency/scroll budget rows and its chunked-reparse tests:
50 KB and 500 KB committed fixtures, and a 20 MB document generated at test
time (never committed). This task provides the generator and the two
committed outputs so slice 4 only has to call the generator.

## Deliverables (all under `test/fixtures/big/`)
- `generate.mjs` — a self-contained Node script (no dependencies) that
  writes deterministic Markdown of a requested size. Content must be
  varied and realistic for a preview: headings of every level, paragraphs,
  fenced code blocks in a few languages, tables, lists (nested), blockquotes,
  task lists, links, and inline code — generated from a fixed seed/pattern so
  the output is byte-identical across runs and machines (no `Date`, no
  `Math.random`, no locale-dependent formatting; CRLF/LF must be explicit).
  Usage: `node test/fixtures/big/generate.mjs <bytes> <path>`; sizes 50 KB
  (`51200`), 500 KB (`512000`) and 20 MB (`20971520`) must all work, and the
  written file must be within ±1 KB of the requested byte count.
- `large-50kb.md` and `large-500kb.md` — committed, byte-identical to
  `generate.mjs 51200` and `generate.mjs 512000` respectively.
- `README.md` — one short paragraph: what the fixtures are for, how to
  regenerate them, and that slice 4 generates the 20 MB document at test
  time with `generate.mjs` (so it is never committed).

## Verify
- Run `node test/fixtures/big/generate.mjs 51200 /tmp/x.md` and
  `... 512000 /tmp/y.md`; `cmp` each against the committed file (or
  `diff -q`). Paste the diff output showing they match.
- `npm run verify` must stay green (no code changed; this is a fixture-only
  slice, so the check is a negative control: the suite runs the existing
  tests untouched).

## Allowed files
test/fixtures/big/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files; paste `cmp`/`diff` output proving the committed files equal the
generator output; paste `npm run verify` output.
