# Replace in Files fixtures

Slice 8 fixtures for Replace in Files. The term is `needle`, matched
case-sensitively. Counts are whole-file line matches: a line counts once when
it holds the term. Every file is ASCII, LF only, ends with one LF, and is
under 1 KB. Git keeps only the executable bit, so `unreadable.md` is committed
readable and a test must copy the tree and apply `chmod 000` to the copy. This
README spells the term, so it counts itself.

| File | Matches | How a test uses it |
| --- | --- | --- |
| `one.md` | 3 | A case-sensitive replace changes 3 lines and leaves `Needle` alone. |
| `nested/two.txt` | 2 | The walk reaches a subfolder. |
| `nested/deeper/three.md` | 1 | The walk reaches a deeper subfolder. |
| `none.md` | 0 | The result list omits a file with no match. |
| `binary.dat` | 1 | It holds the term once, but a text search skips it: a NUL byte sits at offset 0x10. |
| `unreadable.md` | 1 | A copy at mode 000 reports the failure and the walk continues. |
| `README.md` | 1 | Documentation only; it holds the term itself. |
