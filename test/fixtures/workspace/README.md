# Workspace fixture

This committed folder tree is a small, deterministic project used by the
workspace sidebar and watcher tests. Slice 6 generates the 5,000-file folder
and any `node_modules` directory at test time, so neither is ever committed.

## Large workspace tree

`generate-tree.mjs` builds the large workspace fixture. Run
`node test/fixtures/workspace/generate-tree.mjs <dir> [count]`. The default
count is 5000. Slice 6's test calls the script with a temp directory.

