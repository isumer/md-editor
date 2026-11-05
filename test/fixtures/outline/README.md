# Outline fixture

This fixture is for slice 8 outline and document-map tests: a deterministic UTF-8 Markdown document with LF endings that must not be reformatted. The table below is the exact expected outline, read back from the file. Heading text keeps inline code backticks; only the leading markers and closing hashes are removed.

| Line | Level | Heading text |
| ---: | ---: | --- |
| 1 | 1 | Outline fixture |
| 5 | 2 | Closed heading |
| 9 | 3 | Heading with \`inline code\` |
| 13 | 4 | Level four heading |
| 17 | 1 | Setext heading |
| 22 | 2 | Duplicate heading |
| 26 | 2 | Duplicate heading |
| 30 | 3 | Türkçe başlık |
| 34 | 2 | Fenced block |

Line 37 (`# not a heading`) starts with `#` but is inside the fenced code block, so it is code, not a heading, and it must not appear in the outline.
