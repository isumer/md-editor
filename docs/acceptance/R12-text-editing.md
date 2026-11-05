# R12 — Any text file, with encodings, line endings and binary detection

### AC-R12-01 — A binary file is recognised from its first bytes
status: planned
Given the first bytes of a file
When the editor checks whether the file is text
Then a NUL byte in the first 8192 bytes marks it binary, unless the bytes start with a UTF-8, UTF-16LE or UTF-16BE byte order mark; invalid UTF-8 alone does not mark it binary
