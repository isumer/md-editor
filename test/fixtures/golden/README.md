# Golden render fixtures

Ten pairs of Markdown inputs and exact HTML outputs for the preview renderer.

## Rules

- Each `.md` file is a rendered input.
- Each `.html` file is the exact expected output of
  `sanitizeRenderedHtml(renderMarkdown(markdown))`.
- `data-line` attributes are 0-based input line numbers of the block.
- `test/unit/goldenRender.test.ts` compares the output byte-exactly.
- Never regenerate a golden file to make a test pass. A change to a `.html`
  file needs a `Protected-change` reason in the commit message.

`.gitattributes` sets `crlf-line-endings.md -text`, so git keeps its CRLF
bytes on every checkout. `empty.html` is a 0-byte file.

## Pairs

| Input | Covers | HTML guards |
| --- | --- | --- |
| `api-reference.md` | Inline code in a heading, a left-aligned table, a TypeScript fence, nested lists, raw `details` and `summary` with a fence, a blockquote and `kbd` elements | Inline code in a heading, table cell alignment styles, and safe raw HTML (`details`, `summary`, `kbd`) |
| `changelog.md` | Bracketed version headings, bullet lists, a table, a JavaScript fence, a blockquote and link-reference definitions | A reference link resolves inside a heading; list, table, fence and quote markup |
| `crlf-line-endings.md` | CRLF input with a heading, table, bullet list and text fence | CRLF input renders like LF input; table, list and fence markup |
| `empty.md` | An empty file (0 bytes) | Empty input produces empty output |
| `headings-all-levels.md` | ATX headings from level 1 to level 6 and a setext level-2 heading | Every heading level, setext rendering and `data-line` offsets |
| `long-lines.md` | A very long paragraph, a long link, an unbroken long word and a long JavaScript fence line | No wrapping or truncation of long lines; the long output is exact |
| `long-note.md` | Nested bullet lists, task checkboxes (checked, unchecked and uppercase `X`), nested blockquotes and footnote-like references | Checkbox inputs are disabled with the right checked state; list and quote nesting; footnote syntax stays literal text and is not linked |
| `readme-project.md` | Badge images inside links, a table, four language-tagged fences (js, python, rust, bash), a blockquote and a bullet list | Image-in-link markup, table cells, `hljs language-*` classes on fences, quote and list markup |
| `sanitise-html.md` | Raw `script`, `style`, `iframe` and `form`, an `img` with `onerror`, a `javascript:` link, and a safe `div` with `style` and `data-line` | Active content is removed; safe elements and attributes remain; normal Markdown after the raw HTML still renders |
| `unicode-turkish-cjk.md` | Turkish, Chinese, Japanese and Korean text, emoji, a Turkish heading and list, and a blockquote | UTF-8 characters pass through unchanged, including emoji |
