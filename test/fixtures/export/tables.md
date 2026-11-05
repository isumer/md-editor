# Export fixture: tables

## Simple table

| Language | Extension | Year |
| --- | --- | --- |
| JavaScript | `.js` | 1995 |
| Python | `.py` | 1991 |
| Rust | `.rs` | 2010 |

## Column alignment

| Left | Centre | Right | Default |
| :--- | :----: | ----: | --- |
| a | b | c | d |
| longer cell | longer cell | longer cell | longer cell |

## Inline markup in cells

| Syntax | Meaning | Example |
| --- | --- | --- |
| `**bold**` | Strong emphasis | **bold** |
| `*italic*` | Emphasis | *italic* |
| `~~strike~~` | Strikethrough | ~~strike~~ |
| `[link](https://example.com)` | Link | [link](https://example.com) |

## Pipes that need escaping

| Expression | Meaning |
| --- | --- |
| `a \| b` | A literal pipe inside a code span |
| a \| b | A literal pipe in plain text |

## A wide table

| Id | Name | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Alpha | open | ana | 2026-01-02 | A short note |
| 2 | Beta | closed | bo | 2026-02-03 | A much longer note that has to wrap inside the cell of a wide table |

## A table after a paragraph

The paragraph between the two tables, so the export has to keep two tables
apart.

| One | Two |
| --- | --- |
| 1 | 2 |
