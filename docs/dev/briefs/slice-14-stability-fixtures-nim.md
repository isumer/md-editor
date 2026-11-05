# NIM — Slice 14 stability fixtures (pathological Markdown documents)

**Starts from `main`** and runs alongside the current slice (slice 5 owns
`src/**`, `test/unit/**`, `test/e2e/**`; the side task owns
`test/fixtures/workspace/**`). This task touches only
`test/fixtures/stability/**`, so it is file-disjoint from both.

Slice 14 (hardening, PLAN "Slices" §14) and the preview-error resilience rule
need small documents that stress one renderer path each. These are committed
test data; every file is under 4 KB, plain ASCII, LF only.

## Deliverables (all under `test/fixtures/stability/`)
- `README.md` — one paragraph, then a table with one row per file: what the
  file contains, and the failure mode a test must assert (crash, wrong
  output, freeze).
- `deep-nesting.md` — 200 nested blockquote levels (`>` repeated), then one
  paragraph.
- `long-paragraph.md` — one paragraph of 20,000 ASCII words on one line.
- `many-links.md` — 1,000 reference-link uses of one definition plus 100
  distinct definitions, one per line.
- `unclosed-fence.md` — an opening ```` ``` ```` fence with no closing fence,
  followed by 50 lines of text.
- `html-heavy.md` — a small document with 200 inline `<span>` elements and
  one `<script>alert(1)</script>` element, to prove sanitisation drops the
  script and keeps the spans.

Do not invent extra files. Do not touch `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/stability -type f | sort`, `wc -c` for each file,
  and `file test/fixtures/stability/*` (must report ASCII text, not CRLF).
- Paste the exact commands you used to count: 200 `>` characters on the
  first line of `deep-nesting.md`; 20,000 words in `long-paragraph.md`;
  1,000 `][` link uses and 100 definition lines in `many-links.md`; 200
  `<span` and one `<script` in `html-heavy.md`.
- Negative control: render `html-heavy.md` with the project's `renderMarkdown`
  in a throwaway `node` probe (do not commit the probe). The output must
  contain `<span` and must not contain `<script`. Paste both counts.
- `npm run verify` stays green (fixture-only).

## Allowed files
test/fixtures/stability/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list changed files; paste the counts and the negative-control output; paste
`npm run verify` output.
