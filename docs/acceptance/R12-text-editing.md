# R12 — Any text file, with encodings, line endings and binary detection

### AC-R12-01 — A binary file is recognised from its first bytes
status: planned
Given the first bytes of a file
When the editor checks whether the file is text
Then a NUL byte in the first 8192 bytes marks it binary, unless the bytes start with a UTF-8, UTF-16LE or UTF-16BE byte order mark; invalid UTF-8 alone does not mark it binary

### AC-R12-02 — A file's extension selects the highlighting language
status: planned
Given a file path
When the editor chooses the language for highlighting
Then it uses the exact `highlight.js` id and extensions in `docs/languages.md`, ignores case, maps `Makefile` to `makefile`, and selects no language for an unknown extension, a dotfile or a trailing dot

### AC-R12-03 — A file keeps its line endings
status: planned
Given text with CRLF, LF or CR line endings
When the editor detects its line endings
Then the most frequent kind wins and CRLF counts as one, a tie takes the kind that occurs first, and text with no line break has no detected kind; applying a kind converts every line break and keeps a final line break

### AC-R12-04 — Find and replace matches text exactly
status: planned
Given text, a query and options for case, whole word and regular expression
When the editor finds or replaces matches
Then a literal query matches metacharacters literally, a case-insensitive search ignores case, a whole-word match does not touch a letter, number or underscore on either side, an invalid regular expression gives no matches, and replace rewrites every kept match from left to right and expands `$&`, `$n` and `$$` only in regular-expression mode

### AC-R12-05 — A file decodes in its chosen encoding
status: planned
Given a file's bytes and a chosen encoding (`utf-8`, `utf-16le` or `windows-1254`)
When the editor decodes the file with that encoding
Then one matching byte order mark is removed, the Windows-1254 fixture decodes to the six characters U+011F U+00FC U+015F U+0131 U+00F6 U+00E7 on its first line, bytes that are invalid for the encoding give a failure instead of text, and the input bytes are not changed
