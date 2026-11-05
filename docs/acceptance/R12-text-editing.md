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
