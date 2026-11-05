# Side — Slice 11 merge fixtures (deterministic three-way merge set)

**Starts from `main`** and runs alongside the 3e slice and slice 4. File-
disjoint from every queued or running slice (3e touches `src/**`,
`test/unit/**`, `test/e2e/**`; slice 4 touches `src/**`, `test/unit/**`,
`test/e2e/**`; side/023 touches `test/fixtures/source/**`; side/026 touches
`test/fixtures/workspace/**`): this task touches only `test/fixtures/merge/**`.

Slice 11 (three-way merge view, PLAN "Slices" §11) needs a deterministic merge
fixture set for its tests: chunk arrows, apply-non-conflicting, conflict-marker
files, and the git round trip. This task commits that set so slice 11's tests
have known inputs with exact expected outcomes.

## Deliverables (all under `test/fixtures/merge/`)
- `README.md` — one short paragraph: what the fixtures are for, that they are
  committed and deterministic, and the exact expected chunk layout for each
  (so slice 11's tests can assert arrows/conflicts without re-deriving them).
- `base.txt`, `left.txt`, `right.txt` — three versions of one small text file
  (plain ASCII, LF) where, from base:
  - left changes lines (a changed line, an added line, a removed line) in the
    middle,
  - right changes *different* lines (a non-overlapping added line and a
    changed line),
  - left and right both change the *same* line (a genuine conflict), and
  - both add a line at the same place but differently (a second conflict).
  Keep it ~30 lines so the expected chunks are easy to write down.
- `conflict-markers.txt` — a file already containing `<<<<<<<`, `=======`,
  `>>>>>>>` sections (two conflicts), so a parser test can detect
  conflict-marker files without running git.
- `folder/base/`, `folder/left/`, `folder/right/` — the same three-way scenario
  spread across a small folder tree (two files changed/added/deleted, one
  subdirectory), for the folder-level merge round trip.
- All file contents are plain ASCII with LF endings; no symlinks, no binaries,
  no `node_modules`. Do not touch `.gitattributes` or `.gitignore`.

## Verify
- Paste `find test/fixtures/merge -type f | sort` and the content of
  `base.txt`, `left.txt`, `right.txt`.
- State, for each overlapping change, which lines are a conflict and which are
  clean (a short table), matching what a three-way merge produces.
- `npm run verify` must stay green (no code changed; fixture-only, so the check
  is a negative control: the suite runs the existing tests untouched).

## Allowed files
test/fixtures/merge/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files (the `find` output); paste the three versions and the conflict
table; paste `npm run verify` output.
