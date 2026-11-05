# Find/Replace Fixtures

All files are LF only.

| File | Pattern | Count | Command |
|------|---------|-------|---------|
| mixed-case.md | `Cat` (case-sensitive) | 3 | `grep -o 'Cat' mixed-case.md \| wc -l` |
| mixed-case.md | `cat` (case-sensitive) | 5 | `grep -o 'cat' mixed-case.md \| wc -l` |
| mixed-case.md | `CAT` (case-sensitive) | 2 | `grep -o 'CAT' mixed-case.md \| wc -l` |
| mixed-case.md | `cAt` (case-sensitive) | 2 | `grep -o 'cAt' mixed-case.md \| wc -l` |
| mixed-case.md | `catalog` (substring) | 2 | `grep -o 'catalog' mixed-case.md \| wc -l` |
| mixed-case.md | `cat` (case-insensitive) | 12 | `grep -io 'cat' mixed-case.md \| wc -l` |
| mixed-case.md | `cat` (whole word) | 3 | `grep -o '\bcat\b' mixed-case.md \| wc -l` |
| whole-words.md | `cat` (whole word) | 5 | `grep -o '\bcat\b' whole-words.md \| wc -l` |
| whole-words.md | `cats` | 2 | `grep -o 'cats' whole-words.md \| wc -l` |
| whole-words.md | `copycat` | 2 | `grep -o 'copycat' whole-words.md \| wc -l` |
| whole-words.md | `concatenate` | 2 | `grep -o 'concatenate' whole-words.md \| wc -l` |
| whole-words.md | `cat` (substring) | 11 | `grep -o 'cat' whole-words.md \| wc -l` |
| regex-meta.md | `.` (literal dot) | 4 | `grep -F -o '.' regex-meta.md \| wc -l` |
| regex-meta.md | `*` (literal asterisk) | 2 | `grep -F -o '*' regex-meta.md \| wc -l` |
| regex-meta.md | `+` (literal plus) | 2 | `grep -F -o '+' regex-meta.md \| wc -l` |
| regex-meta.md | `?` (literal question) | 2 | `grep -F -o '?' regex-meta.md \| wc -l` |
| regex-meta.md | `[` (literal open bracket) | 2 | `grep -F -o '[' regex-meta.md \| wc -l` |
| regex-meta.md | `]` (literal close bracket) | 2 | `grep -F -o ']' regex-meta.md \| wc -l` |
| regex-meta.md | `(` (literal open paren) | 2 | `grep -F -o '(' regex-meta.md \| wc -l` |
| regex-meta.md | `)` (literal close paren) | 2 | `grep -F -o ')' regex-meta.md \| wc -l` |
| regex-meta.md | `{` (literal open brace) | 2 | `grep -F -o '{' regex-meta.md \| wc -l` |
| regex-meta.md | `}` (literal close brace) | 2 | `grep -F -o '}' regex-meta.md \| wc -l` |
| regex-meta.md | `^` (literal caret) | 2 | `grep -F -o '^' regex-meta.md \| wc -l` |
| regex-meta.md | `$` (literal dollar) | 2 | `grep -F -o '$' regex-meta.md \| wc -l` |
| regex-meta.md | `\|` (literal pipe) | 2 | `grep -F -o '\|' regex-meta.md \| wc -l` |
| regex-meta.md | `\` (literal backslash) | 2 | `grep -F -o '\' regex-meta.md \| wc -l` |
| regex-meta.md | `a.c` (literal string) | 2 | `grep -F -o 'a.c' regex-meta.md \| wc -l` |
| unicode.md | `ğ` | 2 | `grep -oP 'ğ' unicode.md \| wc -l` |
| unicode.md | `ü` | 2 | `grep -oP 'ü' unicode.md \| wc -l` |
| unicode.md | `ş` | 2 | `grep -oP 'ş' unicode.md \| wc -l` |
| unicode.md | `ı` (dotless i) | 2 | `grep -oP 'ı' unicode.md \| wc -l` |
| unicode.md | `ö` | 2 | `grep -oP 'ö' unicode.md \| wc -l` |
| unicode.md | `ç` | 2 | `grep -oP 'ç' unicode.md \| wc -l` |
| unicode.md | `İ` (capital dotted I) | 2 | `grep -oP 'İ' unicode.md \| wc -l` |
| unicode.md | `i` (lowercase dotted i) | 4 | `grep -oP 'i' unicode.md \| wc -l` |
