# Side — Slice 10 folder-compare tree generator

**Base: main.** Runs alongside the current slice. This task touches only
new files under `test/fixtures/compare/`, so it is file-disjoint from slice 5
(`src/**`, `test/unit/**`, `test/e2e/**`), slice 4 fix 2
(`src/renderer/**`, preview tests), the find/replace fixtures
(`test/fixtures/find-replace/**`) and the stability fixtures
(`test/fixtures/stability/**`).

Slice 10 (PLAN "Slices" §10) compares folders. Its tests must show that a
folder compare streams results and that Cancel stops it. They need a large
tree that is deterministic and cheap to build. This task adds a generator.
The generator writes the tree to a target folder. Tests build it in a temp
folder, so no large tree is committed.

## Deliverables
- `test/fixtures/compare/generate-folders.mjs` — a Node script with no
  dependencies. Usage:
  `node test/fixtures/compare/generate-folders.mjs <target-dir> <file-count>`.
  It must:
  - refuse to run when `<target-dir>` exists and is not empty; exit code 2;
  - create `<target-dir>/left/**` and `<target-dir>/right/**`;
  - create `<file-count>` regular files in each tree, with equal relative
    paths on both sides;
  - use a fixed seed, so two runs give byte-identical trees;
  - write only ASCII text with LF line endings;
  - put the same bytes on both sides for most files, different bytes for
    every 7th file, and a left-only file plus a right-only file;
  - print the number of files per tree and the number of differing paths.
- `test/fixtures/compare/README.md` — add one short section that documents
  the generator: usage, the layout, the determinism rule, and the exit codes.
  Do not change existing text.

## Verify
- Run the generator twice into two temp folders, e.g.
  `node test/fixtures/compare/generate-folders.mjs /tmp/fx-a 40` and
  `/tmp/fx-b 40`. Paste `diff -r /tmp/fx-a /tmp/fx-b` and show no output.
- Paste `find /tmp/fx-a -type f | wc -l` and the printed counts.
- Run it again on the non-empty `/tmp/fx-a` and paste the exit code (2).
- Paste `file` output for one generated file (ASCII text, not CRLF).
- Negative control: change one byte in one left file, run
  `diff -r /tmp/fx-a/left /tmp/fx-a/right`, and paste the one differing
  path. Remove the temp folders.
- `npm run verify` stays green (no committed tree, no test change).

## Allowed files
`test/fixtures/compare/generate-folders.mjs` (new) and
`test/fixtures/compare/README.md` (append one section only). Nothing else —
no src, no test/unit, no test/e2e, no other fixture folder, no docs, no
coverage config, no workflows.

## Done means
list changed files; paste the two-run `diff -r` with no output; paste the
counts; paste the exit code; paste the negative control; paste `npm run
verify` output.
