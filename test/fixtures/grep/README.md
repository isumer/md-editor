# Find in Files fixtures

Deterministic, committed fixtures for slice 7's Find in Files correctness tests: exact matches, case options, binary skip and recursion. The search term is the one defined in the slice-7 brief; it is not spelled out here so that this README is not itself a search result. Every case-sensitive occurrence in the fixture tree is listed below, so tests assert these exact `file:line` values. The 5,000-file streaming and cancel folder is generated at test time and is never committed.

| file:line |
|---|
| `data.json:2` |
| `notes/alpha.md:3` |
| `notes/alpha.md:4` |
| `notes/archive/gamma.md:3` |
| `notes/beta.md:3` |
| `src/app.js:1` |
| `src/app.js:3` |

`src/app.js:5` contains the capitalised spelling and matches only when the case-insensitive option is on. `binary.dat` contains a NUL byte and must be skipped.
