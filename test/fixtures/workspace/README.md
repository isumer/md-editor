# Workspace fixture

This committed folder tree is a small, deterministic project used by the
workspace sidebar and watcher tests. Slice 6 generates the 5,000-file folder
and any `node_modules` directory at test time, so neither is ever committed.
