# Compare fixtures

Known inputs for slice 10's compare features (line diff, word-level diff,
ignore options and folder compare), with the expected results written down
here so slice 10's tests assert against them without re-deriving them.
Every file is committed and deterministic: fixed bytes, no generated data,
no clock or randomness. No fixture data file (everything below but this
README) is a symlink, contains a NUL byte, or is larger than 4 KB.

`.gitattributes` sets `* -text` so git preserves the byte-sensitive parts
of these fixtures (trailing spaces, tabs and CRLF) on every checkout.
Unless a pair is described as CRLF, files are ASCII with LF endings, except
`words/` which is UTF-8.

## `lines/`

`lines/left.txt` (34 lines) and `lines/right.txt` (35 lines) are plain
ASCII with LF. `diff -u` produces four hunks; ranges include their
surrounding context and are 1-based:

- Hunk 1: left 1-7 → right 1-7 — the changed line: left 4
  `Main export: timber` becomes right 4 `Main export: timber and paper`.
- Hunk 2: left 9-14 → right 9-16 — the inserted block of two lines:
  right 12 `Museum annex: open` and right 13 `Gallery: two`, inserted
  after left 11.
- Hunk 3: left 16-22 → right 18-23 — the deleted line: left 19
  `Annual festival: spring` has no counterpart.
- Hunk 4: left 24-34 → right 25-35 — the moved-looking edit: left 27
  `Time zone: UTC+1` is deleted, and the same text is added as right 33
  (after `Flower: sea thrift`); every other line in the hunk is unchanged.

## `words/`

`words/left.txt` and `words/right.txt` are three LF lines each, UTF-8, with
exactly one changed word range per line. A word is a whitespace-separated
token, numbered from 1, with attached punctuation included in the token:

- Line 1, word 4 (left) → word 4 (right): `fox` → `cat`.
- Line 2, word 2 (left) → word 2 (right): `2,` → `2;` — a punctuation-only
  change; only the final comma/semicolon differs.
- Line 3, word 4 (left) → word 4 (right): `güzel` → `kötü` — a Turkish
  word in UTF-8 (the `ü`, `ç` and `ö` characters are multibyte); the
  trailing full stop is unchanged.

All other words and all whitespace are identical.

## `whitespace/`

`whitespace/left.txt` and `whitespace/right.txt` are five LF ASCII lines.
Lines 1 and 5 are identical. Lines 2, 3 and 4 differ, each in one way:

- Line 2: the left line ends with three trailing spaces; the right line
  has none.
- Line 3: the left line starts with one tab; the right line starts with
  four spaces. The text after the indentation is identical.
- Line 4: the left line reads `Case matters on this line.`; the right line
  reads `Case MATTERS on this line.` — a case difference only.

Here "ignore whitespace" means runs of spaces and tabs, including leading
and trailing whitespace, are normalised away. Expected results:

- Ignore whitespace alone: lines 2 and 3 compare equal; line 4 still
  differs (case).
- Ignore case alone: line 4 compares equal; lines 2 and 3 still differ
  (trailing spaces and indentation).
- Ignore whitespace and ignore case together: all five lines compare
  equal, so the files are identical.
- Neither option: lines 2, 3 and 4 differ.

## `line-endings/`

`line-endings/lf.txt` and `line-endings/crlf.txt` hold the same three
ASCII lines of text. `lf.txt` uses LF (`\n`); `crlf.txt` uses CRLF
(`\r\n`). They are byte-different and text-identical, so a compare that
normalises line endings reports no differences.

## `identical/`

`identical/a.md` and `identical/b.md` are byte-for-byte identical Markdown
files, including the trailing newline.

## `folders/`

`folders/left/` and `folders/right/` are a small tree with 12 files in
total: `shared/` is nested on both sides and `node/` is nested on the
right for the type mismatch. Expected status for every relative path:

| Relative path | Status |
| --- | --- |
| `changed.txt` | `changed` |
| `eol.txt` | `identical` (text-identical; LF on the left, CRLF on the right, so the bytes differ) |
| `identical.txt` | `identical` |
| `left-only.txt` | `left-only` |
| `node` | `type-mismatch` (a file on the left, a directory on the right) |
| `node/inner.txt` | `right-only` (inside the right-hand directory; a compare that stops at the `node` type mismatch does not visit it) |
| `right-only.txt` | `right-only` |
| `shared/nested.txt` | `identical` |

`shared/` itself is a directory on both sides and is traversed, not
reported. A recursive byte comparison (`diff -r`) reports `changed.txt`
and `eol.txt` as differing, `left-only.txt` as only on the left,
`right-only.txt` as only on the right, and `node` as a regular file versus
a directory; it does not visit `node/inner.txt`. No other path is
reported, which matches `identical` for `identical.txt` and
`shared/nested.txt`.
