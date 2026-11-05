# Encoding fixtures

Five committed byte files for the text-decoding tests. Decode each file with
the encoding in the table to get its text back. `.gitattributes` sets
`test/fixtures/encodings/** -text`, so git keeps these bytes on every
checkout. The detection name is the exact string a detection test must
report.

| File | Bytes | Encoding | Line endings | BOM | Text | Detection name |
| --- | ---: | --- | --- | --- | --- | --- |
| `binary.bin` | 16 | none (binary) | none | none | Not text. Bytes `00` to `0f` in order. | `binary` |
| `crlf.txt` | 20 | ASCII (a UTF-8 subset) | CRLF | none | Three lines: `alpha`, `beta`, `gamma`; each line ends with CRLF. | `UTF-8` |
| `utf16le.txt` | 14 | UTF-16LE | LF (encoded as `0a 00`) | `ff fe` | `hello` then LF. | `UTF-16LE` |
| `utf8-bom.txt` | 9 | UTF-8 | LF | `ef bb bf` | `hello` then LF. | `UTF-8` |
| `windows-1254.txt` | 17 | Windows-1254 | CRLF | none | Line 1 is U+011F U+00FC U+015F U+0131 U+00F6 U+00E7. Line 2 is `turkish`. Each line ends with CRLF. | `windows-1254` |

## NUL byte in `binary.bin`

- The first NUL byte is at 0-based offset 0 (1-based offset 1).
- A detector must scan at least 1 byte to see that NUL byte.
- `utf16le.txt` contains NUL bytes after its BOM, but it is not binary:
  its first bytes are `ff fe`. Rule 1 of AC-R12-01 checks the BOM first.

## Turkish line in `windows-1254.txt`

Line 1 holds six characters, each stored as one Windows-1254 byte:
U+011F (g with breve) is `f0`, U+00FC (u with diaeresis) is `fc`,
U+015F (s with cedilla) is `fe`, U+0131 (dotless i) is `fd`,
U+00F6 (o with diaeresis) is `f6`, and U+00E7 (c with cedilla) is `e7`.
