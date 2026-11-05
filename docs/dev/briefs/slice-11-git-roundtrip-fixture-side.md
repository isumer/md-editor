# Side — Slice 11 git round-trip fixture

**Base: main.** Runs alongside the current slice. This task touches only
two files under `test/fixtures/merge/`, so it is file-disjoint from slice 5
(`src/**`, `test/unit/**`, `test/e2e/**`), slice 4 fix 2
(`src/renderer/**`, preview tests), the compare generator
(`test/fixtures/compare/**`) and the replace-in-files fixtures
(`test/fixtures/replace-in-files/**`).

Slice 11 (PLAN "Slices" §11) has a `git mergetool` and `git difftool`
mode. Its test must show the round trip: git starts the editor on a
conflict, the user resolves it, and git records the result. That test
needs a temporary repository with one real conflict. This task adds a
generator for it.

## Deliverables
- `test/fixtures/merge/git-roundtrip.mjs` — a Node script with no npm
  dependencies. Usage:
  `node test/fixtures/merge/git-roundtrip.mjs <target-dir>`.
  It must:
  - refuse to run when `<target-dir>` exists and is not empty; exit code 2;
  - refuse to run when `git` is not on `PATH`; exit code 3;
  - create a git repository in `<target-dir>`;
  - commit the bytes of `base.txt` as `doc.txt` on `main`;
  - branch `left`, commit the bytes of `left.txt` as `doc.txt`;
  - branch `right` from `main`, commit the bytes of `right.txt` as `doc.txt`;
  - check out `left`, merge `right`, and leave the unresolved conflict in
    the working tree;
  - print the absolute path of `doc.txt` and the merge state
    (`git status --porcelain` lines);
  - be deterministic: same commit ids on two runs. Set a fixed author and
    committer name, email and date with `git -c` and environment
    variables, and set `core.autocrlf=false`.
  - write nothing outside `<target-dir>`.
  Read the three fixture files from the script's own directory. Do not
  copy their bytes into the script.
- `test/fixtures/merge/README.md` — add one short section that documents
  the generator: usage, the branch layout, the determinism rule, and the
  exit codes. Do not change existing text.

## Verify
- Run the generator twice into two temp folders, e.g.
  `node test/fixtures/merge/git-roundtrip.mjs /tmp/gr-a` and
  `/tmp/gr-b`. Paste `git -C /tmp/gr-a log --format=%H --all` and the
  same for `/tmp/gr-b`; the ids must match.
- Paste `git -C /tmp/gr-a status --porcelain` and
  `git -C /tmp/gr-a ls-files --unmerged`.
- Paste `diff <(git -C /tmp/gr-a show :1:doc.txt) test/fixtures/merge/base.txt`
  and the same for stages 2 and 3 against `left.txt` and `right.txt`.
- Run it again on the non-empty `/tmp/gr-a` and paste the exit code (2).
- Negative control: run `git -C /tmp/gr-a merge --abort`, paste
  `git -C /tmp/gr-a status --porcelain` with no output, and state that
  the conflict is gone. Remove the temp folders.
- `npm run verify` stays green (fixture-only).

## Allowed files
`test/fixtures/merge/git-roundtrip.mjs` (new) and
`test/fixtures/merge/README.md` (append one section only). Nothing else —
no src, no test/unit, no test/e2e, no other fixture folder, no docs, no
coverage config, no workflows.

## Done means
list changed files; paste the two commit-id lists; paste the status and
unmerged output; paste the three stage diffs; paste the exit code; paste
the negative control; paste `npm run verify` output.
