# NIM — Slice 8 Replace-in-Files fixture tree

**Base: main.** Runs alongside the current slice. This task touches only
`test/fixtures/replace-in-files/**`, a new folder, so it is file-disjoint
from slice 5 (`src/**`, `test/unit/**`, `test/e2e/**`), slice 4 fix 2
(`src/renderer/**`, preview tests), the find/replace fixtures
(`test/fixtures/find-replace/**`), the stability fixtures
(`test/fixtures/stability/**`) and the compare generator
(`test/fixtures/compare/**`).

Slice 8 (PLAN "Slices" §8) has Replace in Files. Its test must prove three
things: the preview shows the exact match count per file, a write is atomic,
and a file changed after the preview is skipped. These are committed test
data. All files are plain ASCII with LF line endings.

## Deliverables (all under `test/fixtures/replace-in-files/`)
- `README.md` — one paragraph, then a table with one row per file: the exact
  count of the term `needle` (case-sensitive) and how a test uses the file.
  State that all files are LF only and that counts are whole-file line
  matches.
- `one.md` — the term `needle` on 3 lines, plus one line with `Needle`
  (capital N). A case-sensitive replace must change 3 lines only.
- `nested/two.txt` — `needle` on 2 lines. It proves the walk reaches
  subfolders.
- `nested/deeper/three.md` — `needle` on 1 line.
- `none.md` — no `needle`. It proves the result list omits a file with no
  match.
- `binary.dat` — a small file with a NUL byte at offset 0x10 and the text
  `needle` after it. A text search must skip this file.
- `unreadable.md` — the text `needle`, mode 000. A test must report the
  failure and keep going. State in the README that git does not keep mode
  000; a test must apply it with `chmod` after a copy.
- All files end with one LF. No file is larger than 1 KB.

Do not invent extra files. Do not touch `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/replace-in-files -type f | sort` and `wc -c`
  for each file.
- For every count in the README, paste `grep -c needle <file>` and its
  output. The README counts must equal the outputs.
- Paste `od -An -tx1 binary.dat | head -3` and show the NUL byte.
- Negative control: copy the tree to a temp path, change one `needle` line,
  and paste the count command giving a different number. Remove the temp
  folder.
- `npm run verify` stays green (fixture-only).

## Allowed files
`test/fixtures/replace-in-files/**` only. Nothing else — no src, no
test/unit, no test/e2e, no docs, no coverage config, no workflows.

## Done means
list changed files; paste sizes; paste every count command and its output;
paste the NUL check; paste the negative control; paste `npm run verify`
output.
