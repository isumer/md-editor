# Side — Slice 7 Find-in-Files fixtures (deterministic search folder)

**Starts from `main`** and runs alongside slice 4. File-disjoint from every
queued or running slice (slice 4 touches `src/**`, `test/unit/**`,
`test/e2e/**`; side/023 `test/fixtures/source/**`; side/026
`test/fixtures/workspace/**`; side/028 `test/fixtures/merge/**`; side/030
`test/fixtures/compare/**`): this task touches only `test/fixtures/grep/**`.

Slice 7 (text editing, PLAN "Slices" §7) tests Find in Files: streaming first
results and cancel over a generated 5,000-file folder (never committed), plus
correctness — exact matches, case options, binary skip, recursion. This task
commits the small deterministic folder so slice 7's correctness tests assert
exact `file:line` results against written-down expected outcomes instead of
re-deriving them.

## Deliverables (all under `test/fixtures/grep/`)
- `README.md` — one short paragraph: what the fixtures are for, that they are
  committed and deterministic, and a table of every occurrence of the search
  term (below) as `file:line`, so slice 7's tests can assert against it.
- A small tree shaped like a project, all text files plain ASCII/UTF-8, LF:
  - `notes/alpha.md` — a few lines of known Markdown; the term `needle` on two
    different lines (so a single-file multiple-match case exists).
  - `notes/beta.md` — the term `needle` on one line.
  - `notes/archive/gamma.md` — the term `needle` inside a nested subfolder
    (recursion case).
  - `src/app.js` — `needle` in a `//` comment and inside a string literal, and
    one occurrence of `Needle` (capital) in a comment (case-sensitivity case).
  - `data.json` — `needle` as a JSON string value.
  - `no-match.txt` — a file with no occurrence of the term.
  - `binary.dat` — a small file containing a NUL byte (binary; Find in Files
    must skip it). Git's `text=auto` already leaves NUL-byte files untouched,
    so no `.gitattributes` is expected; if git converts it, add a scoped
    `test/fixtures/grep/.gitattributes` with `binary.dat -text` only.
- No symlinks, no `node_modules`, no files > 4 KB. Do not touch the root
  `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/grep -type f | sort` and the content of one file.
- Negative control: `grep -rn needle test/fixtures/grep` and
  `grep -rni needle test/fixtures/grep` next to the README table; show the
  case-sensitive list matches the table, and the case-insensitive list finds
  exactly one extra line (the `Needle`). Show `file test/fixtures/grep/binary.dat`
  reports it as binary (NUL byte).
- `npm run verify` stays green (fixture-only change; the negative control is
  that the suite runs the existing tests untouched).

## Allowed files
test/fixtures/grep/** only. Nothing else — no src, no test/unit, no test/e2e,
no docs, no coverage config, no workflows.

## Done means
list files (the `find` output); paste the two `grep` outputs next to the README
table; paste `npm run verify` output.
