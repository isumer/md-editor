# Export fixtures (slice 13)

Inputs for slice 13 tests: HTML export contains the rendered heading and the
inlined CSS, and PDF export starts with `%PDF-` and spans more than one page
for a long document. The files are committed and deterministic. They are
plain Markdown with LF line endings and UTF-8, so a test reads them as text.

## Files and exact contents

| File | What it exercises | Exact facts (recount before you change the file) |
| --- | --- | --- |
| `headings-toc.md` | Every heading level and a hand-written table of contents | 1 × h1, 5 × h2, 1 × h3, 1 × h4, 1 × h5, 1 × h6; 7 links |
| `code-blocks.md` | Fenced code with known, unknown and absent languages | 6 fenced blocks; `js`, `python`, `bash`, `js`, `notalanguage`, no language |
| `tables.md` | Alignment, inline markup, escaped pipes, a wide table | 6 tables |
| `images.md` | Local images, a titled image, an image in a link, a missing image | 4 `<img>`; 1 link |
| `links.md` | Relative, absolute, mail and anchor links; links that must not be resolved | 10 links |
| `unicode.md` | Turkish case pairs, CJK text, emoji, non-Latin code | 1 × h1, 8 × h2, 1 × h3, 1 table, 1 fenced block |
| `unsafe-html.md` | Raw HTML that the sanitiser must clean | see below |
| `long-document.md` | A long document for a multi-page PDF and export speed | 2000 lines, 166 `## Section N:` headings, 166 tables, 166 fenced blocks |
| `front-matter.md` | Leading YAML front matter with `title:` and `tags:` | 1 × h1, 1 × h2; line 1 is `---`; 2 `---` delimiters; 1 `tags:` key; open question: whether the export treats the leading fence-like block as text |
| `crlf-document.md` | Same content as `images.md` with CRLF bytes | 20 CRLF line endings and no bare LF; `.gitattributes` sets `-text` for this file, as for the encodings fixtures |
| `html-comments.md` | Markdown comments between paragraphs, raw `<img>` with `onerror` | 1 × h1; 3 comments; 1 `<img onerror>` the sanitiser must clean |
| `nested-lists.md` | Three nesting levels, mixed ordered/unordered, loose items | 1 × h1, 3 × h2; unordered markers by indent: 5 at 0, 4 at 2, 2 at 3, 2 at 4, 2 at 6 spaces; ordered markers by indent: 3 at 0, 2 at 3, 3 at 4, 2 at 6 spaces; 2 loose items each with a paragraph and a code span |
| `entity-code.md` | HTML entities in text and fenced code that must stay literal | 1 × h1, 4 × h2; 1 fenced block; 16 entity references in text (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&copy;`, `&reg;`, `&nbsp;`, `&mdash;`); 5 entity references inside the fence, including two `&gt;`, which must stay literal |
| `assets/diagram.png` | The image of `images.md` | 24 × 24, blue `#1F4FD8` |
| `assets/badge.png` | The badge of `images.md` | 16 × 16, orange `#E8590C` |

## Direct targets

- `images.md` refers to `assets/diagram.png` and `assets/badge.png`.
  `assets/missing.png` is absent on purpose. A test must copy the whole
  `test/fixtures/export/` folder, or the images cannot be resolved.
- `links.md` refers to `./headings-toc.md` and `./tables.md#column-alignment`,
  which exist. `./missing-fixture.md`, `../outside-the-folder.md` and
  `/docs/index.md` do not resolve. An export must not read them.
- `headings-toc.md` links to `#level-two` … `#duplicate-heading-1`. The
  heading ids use GitHub-style slugs and add `-1` to the second duplicate.
  The preview and the export add no heading ids today, so the export keeps
  the links as written.

## unsafe-html.md

The export must run the same sanitiser as the preview. The fixture holds each
active construct once:

- `script`, `style`, `link`, `meta`, `base` and `form` are removed by
  `FORBID_TAGS` (`src/renderer/features/preview/sanitize.ts`).
- Event handlers (`onerror`, `onload`), `javascript:` URLs and the
  `example.com` frame are removed.
- `details`, `summary`, inline `style`, `data-*` attributes and normal
  Markdown stay.
- The `input` and `button` children of the removed `form` stay, without the
  form. This is the known open product decision in PIPELINE-STATE.md. A test
  must not assert that they are removed until that decision changes.

## Negative control

Render the fixtures with the project's Markdown-it and count the constructs.
The counts must match the table above. These runs prove the check notices a
wrong parser:

- `tables.md` with the `table` rule disabled renders 0 tables (6 with it).
- `code-blocks.md` with the `fence` rule disabled renders 0 blocks (6 with it).
- `grep -c '^## Section' long-document.md` prints `166` and
  `wc -l long-document.md` prints `2000`.

`long-document.md` is committed as written, not generated. If its structure
changes, update this README and the counts above.
