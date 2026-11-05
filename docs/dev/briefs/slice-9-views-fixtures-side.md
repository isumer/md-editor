# Side — Slice 9 views/sync-scroll fixtures (deterministic heading map)

**Starts from `main`** and runs alongside the current slice. File-disjoint from
every queued or running slice (slice 4 fix and slice 5 touch `src/**`,
`test/unit/**`, `test/e2e/**`; nim slice 13 export touches
`test/fixtures/export/**`; slice 8 powertools touches
`test/fixtures/powertools/**`): this task touches only
`test/fixtures/views/**`.

Slice 9 (views + sync scroll, PLAN "Slices" §9) tests sync scroll: "scroll to
a heading in the editor → same heading at the top of the preview (±1 block)".
This task commits one deterministic document with many distinct headings at
known line numbers, plus the heading → line map, so slice 9's sync-scroll
tests assert exact positions instead of re-deriving them.

## Deliverables (all under `test/fixtures/views/`)
- `README.md` — one short paragraph (what the fixture is for, that it is
  committed and deterministic), then a table mapping every heading to its line
  number, one row per heading, e.g. `## Heading 03` → line N.
- `sync-scroll.md` — a Markdown document, plain ASCII, LF only:
  - 40 headings `## Heading 01` … `## Heading 40` (zero-padded), each followed
    by two lines of distinct body text (e.g. `Body for heading 03.`).
  - One section (Heading 20) also contains a fenced code block of 15 lines of
    code, so at least one heading sits below a tall block (sync scroll must
    land on it too).
  - Heading text is unique and greppable with `^## `; no body line starts with
    `## `.
- No symlinks, no `node_modules`, no files > 8 KB, no images, no external
  links. Do not touch the root `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/views -type f | sort` and the content of one file.
- Negative control: `grep -n '^## ' test/fixtures/views/sync-scroll.md` next to
  the README table; the heading texts and line numbers match exactly (40 rows,
  none missing, none extra).
- `file test/fixtures/views/sync-scroll.md` reports ASCII text with LF line
  endings (not CRLF).
- `npm run verify` stays green (fixture-only change; the negative control is
  that the suite runs the existing tests untouched).

## Allowed files
test/fixtures/views/** only. Nothing else — no src, no test/unit, no test/e2e,
no docs, no coverage config, no workflows.

## Done means
list files (the `find` output); paste the `grep -n '^## '` output next to the
README table; paste `file` output; paste `npm run verify` output.
