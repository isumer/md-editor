# Markdown chunk-boundary fixtures

Small Markdown inputs for equivalence tests between a full render and a
chunked render. Each file crosses one known parse boundary. They are inputs
only: a test renders the whole document and its chunks, then compares the
output. Do not commit expected HTML.

Every file is ASCII, uses LF only, ends with one LF and is under 2 KB. No
file contains a tab, a NUL byte or a CR byte.

One row per fixture input file:

| File | Boundary crossed | What an equivalence test must compare |
| --- | --- | --- |
| `reference-definition-last.md` | One reference-link use is 32 lines before the matching definition on the last line. | The chunked render must resolve the link to the same `<a href>` as the full render. |
| `loose-list.md` | Nineteen blank lines separate 20 items of one loose list; one paragraph follows. | The chunked render must keep all 20 items in one list, with the same item text and order as the full render. |
| `indented-code-blank-line.md` | One blank line occurs inside a four-space indented code block. | The chunked render must keep both code lines in one `<pre><code>` block; the line after the blank line must not become a paragraph. |
| `opened-fence.md` | A 40-line fenced code block opens before and closes after the middle of the file. | The chunked render must keep all 40 lines in one `<pre><code>` block; the heading and paragraph after the fence must equal the full render. |
| `hard-break.md` | Six of 30 text lines end with two trailing spaces and so make hard breaks. | Each `<br>` in the chunked render must occur at the same source line as in the full render. |
