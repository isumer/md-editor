# Side — Slice 6 workspace-tree fixtures (small committed folder tree)

**Starts from `main`** and runs alongside slice 4. File-disjoint from every
queued or running slice (slice 4 touches `src/**`, `test/unit/**`,
`test/e2e/**`; the 3e slice touches `src/**`; the 023 side branch touches
`test/fixtures/source/**`): this task touches only `test/fixtures/workspace/**`.

Slice 6 (workspace sidebar, PLAN "Slices" §6) needs a small deterministic
folder tree for its watcher and tree-listing tests (the 5,000-file folder and
the `node_modules` exclusion case are generated at test time, never committed).
This task commits that small tree so slice 6's watcher tests have a known file
set to assert exact relative paths against.

## Deliverables (all under `test/fixtures/workspace/`)
- A deterministic folder tree with known content, shaped like a small project:
  - `README.md` — one short paragraph: what the tree is for, that it is a
    committed fixture, and that slice 6 generates the 5,000-file folder and any
    `node_modules` directory at test time (so they are never committed).
  - Two or three Markdown files at the root, each with a few lines of known
    content (fixed headings so a test can assert names and that a specific file
    is openable).
  - At least two nested subdirectories (e.g. `notes/`, `notes/archive/`) each
    containing a `.md` file, so the tree is not flat.
  - One dotfile (e.g. `.hidden.md`) and one empty directory kept in git with a
    `.gitkeep`, so a watcher test can distinguish hidden files and empty dirs.
  - One non-Markdown file (e.g. `data.json`), so the sidebar lists non-`.md`
    files too.
- All file contents are plain ASCII with LF endings (repo `.gitattributes`
  already enforces `eol=lf`); no `node_modules`, no symlinks, no binary files.
- Do not touch `.gitignore` (a `node_modules/` fixture would be ignored; slice 6
  creates that directory itself at test time).

## Verify
- Paste `find test/fixtures/workspace -type f -o -type d | sort` listing the
  whole tree, and the content of one file to show it is deterministic.
- `npm run verify` must stay green (no code changed; fixture-only, so the check
  is a negative control: the suite runs the existing tests untouched).

## Allowed files
test/fixtures/workspace/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no coverage config, no workflows.

## Done means
list files (the `find` output); paste the tree and one file's content; paste
`npm run verify` output.
