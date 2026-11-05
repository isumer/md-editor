# Tab fixtures

These committed, deterministic files are the corpus for the slice 5 tab
tests: each document is line-addressable so a test can open it in a tab,
scroll to a marker, edit, switch tabs, and assert exact text and per-tab
state. `crlf.md` is marked `-text` in this directory's `.gitattributes` so
its CRLF bytes survive every checkout.

| File | Contents | What a tab test should assert |
|---|---|---|
| `alpha.md` | `# Alpha` heading, an introduction paragraph, 30 lines tagged `alpha-line-01` through `alpha-line-30`, one fenced code block, and one bullet list. | Opening alpha and beta together, alpha keeps its own text, cursor, selection, scroll position, and undo history across tab switches, and an edit in alpha never appears in beta. |
| `beta.md` | `# Beta` heading, an introduction paragraph, 30 lines tagged `beta-line-01` through `beta-line-30` in a different word order, one fenced code block, and one bullet list. | Beta keeps its own per-tab state independently of alpha, and its different text makes the active tab identifiable by text alone. |
| `plain.txt` | 20 plain-text lines tagged `plain-line-01` through `plain-line-20`, with no Markdown syntax. | A non-Markdown document opens in a tab and keeps its own text and view state like the Markdown documents do. |
| `crlf.md` | A small Markdown document with CRLF line endings and no BOM. | Editing and saving it leaves CRLF line endings on disk, while the other fixtures stay LF. |
