# Side — Slice 6 workspace tree generator (5,000 deterministic files)

**Starts from `main`** and runs alongside the current slice (slice 5 owns
`src/**`, `test/unit/**`, `test/e2e/**`; the Karen stability task owns
`test/fixtures/stability/**`). This task touches only
`test/fixtures/workspace/**`, so it is file-disjoint from both.

Slice 6 (workspace sidebar, PLAN "Slices" §6) must list a 5,000-file folder in
under 500 ms and must not list `node_modules`. AGENTS.md says large fixtures
are generated deterministically at test time, never committed. The existing
small tree under `test/fixtures/workspace/` is committed. This task adds the
generator that makes the large folder.

## Deliverables (all under `test/fixtures/workspace/`)
- `generate-tree.mjs` — a plain Node script, no dependencies, run as
  `node generate-tree.mjs <dir> [count]`. Default `count` is 5000. It must:
  - create `<dir>` (must not exist or must be empty) and write `count`
    Markdown files with deterministic names and content (`file-0001.md` …
    `file-5000.md`, each a fixed heading plus one fixed paragraph);
  - spread the files over nested folders so the tree is not flat (for example
    one flat top-level batch plus batches under `a/b/` and `c/`);
  - create a `node_modules/` folder with at least three `.md` files inside it,
    so a test can assert they are not listed;
  - write LF endings only and touch no file outside `<dir>`;
  - print the file count it wrote.
- `README.md` — append one short section that names the script, the exact
  command, the default count, and that slice 6's test calls it with a temp
  directory. Keep the existing text; add only this section.

## Verify
- `node test/fixtures/workspace/generate-tree.mjs /tmp/wstree-1` and the same
  command again to `/tmp/wstree-2` in separate empty temp dirs. Paste
  `find <dir> -type f | wc -l` and `find <dir> -type f -print0 | sort -z |
  xargs -0 sha256sum | sha256sum` for both. The two digests must match.
- Paste `find /tmp/wstree-1 -maxdepth 3 -type d | sort | head -20` and the
  first 5 lines of one generated file.
- `file` reports ASCII text (not CRLF) for the generated files.
- Remove the temp dirs afterwards.
- `npm run verify` stays green (fixture-only; negative control is that the
  existing tests run unmodified).

## Allowed files
test/fixtures/workspace/** only. Nothing else — no src, no test/unit, no
test/e2e, no docs, no `.gitignore`, no coverage config, no workflows.

## Done means
list changed files; paste both generation runs and the two digests; paste the
tree listing and one file; paste `npm run verify` output.
