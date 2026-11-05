# Binary detection fixtures

Known byte-files for slice 7's binary-detection tests, so "a binary file is
refused" asserts against committed bytes instead of buffers generated ad hoc.
Every file is deterministic and tiny (the four `.bin`/`.txt` samples are under
64 bytes; `tiny.png` is 68 bytes). `.gitattributes` marks each sample `-text`
so git stores and checks out its exact bytes, and deliberately does not mark
this README. Hex columns are lowercase and match `od -A x -t x1z -N 16`; file
offset `000000` is the first byte.

| File | First 16 bytes (hex) | Total bytes | Why it is here |
| --- | --- | --- | --- |
| `nul-byte.bin` | `70 72 69 6e 74 61 62 6c 65 20 61 73 63 69 69 21` | 38 | The first 16 bytes are printable ASCII `printable ascii!`; the NUL is at offset `0x10`, followed by ASCII `tail ascii after nul\n` |
| `nul-at-start.bin` | `00 6e 75 6c 20 63 6f 6d 65 73 20 66 69 72 73 74` | 17 | The NUL is the very first byte, followed by ASCII `nul comes first\n` (the 17th byte, at offset `0x10`, is the final `0a`) |
| `utf16le-bom.txt` | `ff fe 68 00 65 00 6c 00 6c 00 6f 00` | 12 | The whole 12-byte file: the UTF-16LE BOM `ff fe` then `hello` (`68 00 65 00 6c 00 6c 00 6f 00`) |
| `invalid-utf8.bin` | `70 72 65 66 69 78 20 c3 28 74 61 69 6c 0a` | 14 | The whole 14-byte file: ASCII `prefix `, the truncated two-byte sequence `c3 28` at offsets `0x07`–`0x08`, then ASCII `tail\n` |
| `tiny.png` | `89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52` | 68 | A real 1x1 RGBA PNG: the standard 8-byte signature, then the IHDR chunk length `00 00 00 0d` and type `IHDR` |
