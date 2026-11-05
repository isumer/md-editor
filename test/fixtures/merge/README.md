# Three-way merge fixtures

These fixtures are committed, deterministic inputs for slice 11's three-way
merge tests: chunk arrows, applying non-conflicting changes, detecting
conflict-marker files and the folder-level merge round trip. Every file is
plain ASCII with LF endings, and the line numbers below are 1-based and
stable, so tests can assert chunk direction and conflict positions without
re-deriving them. Merge `left.txt` (left), `base.txt` (base) and `right.txt`
(right) in that base order; the three files have 36, 37 and 38 lines.

## `base.txt` / `left.txt` / `right.txt`

| Chunk | Base lines | Left | Right | Expected merge outcome |
|---|---|---|---|---|
| 1 | 6 | changes `The build runs on the shared runner.` to `The build runs on the release runner.` | unchanged | clean, take left |
| 2 | after 10 | inserts `A smoke test runs before every build.` | unchanged | clean, take left |
| 3 | 15 | deletes `The staging build is retired.` | unchanged | clean, take left (line removed) |
| 4 | after 20 | unchanged | inserts `The review checklist is published weekly.` | clean, take right |
| 5 | 25 | unchanged | changes `Two reviewers approve every merge.` to `Two reviewers approve every release.` | clean, take right |
| 6 | 30 | changes `The project is released under GPL-3.` to `The project is released under GPL-3 or later.` | changes it to `The project is released under GPL-3 only.` | conflict |
| 7 | after 34 | inserts `Left security review is mandatory.` | inserts `Right security review is mandatory.` | conflict (add/add at the same place) |

All other base lines are unchanged, so a merge has seven change chunks:
five clean chunks (1-5) and two conflicts (6 and 7). Chunks 1-3 are
left-only, chunks 4-5 are right-only, and chunks 6-7 overlap. The clean
changes all apply; the two conflicting regions in the merged result are:

```
<<<<<<< left
The project is released under GPL-3 or later.
=======
The project is released under GPL-3 only.
>>>>>>> right
```

```
<<<<<<< left
Left security review is mandatory.
=======
Right security review is mandatory.
>>>>>>> right
```

The marker labels are chosen by the caller; only the two sides are fixed.
With `git merge-file -p left.txt base.txt right.txt` the result has exactly
these two conflicts and no other change; the two-way conflict regions above
match that output once its path labels are replaced by `left` and `right`.

## `conflict-markers.txt`

A file that already contains two conflict-marker sections, so a parser test
can detect a conflict-marker file without running git. The first section has
`HEAD` versus `feature/merge-view` content for the deployment window; the
second does the same for the support rota. It has exactly two `<<<<<<<`,
two `=======` and two `>>>>>>>` lines.

## `folder/`

The same kind of scenario across a small tree with one subdirectory. The
trees are disjoint per file: `folder/base/`, `folder/left/` and
`folder/right/`.

| Path | Base | Left | Right | Expected merge outcome |
|---|---|---|---|---|
| `common.txt` | present | same | same | unchanged |
| `edit-left.txt` | present | line 2 changed | same as base | clean, take left |
| `edit-right.txt` | present | same as base | line 2 changed | clean, take right |
| `remove-left.txt` | present | absent | same as base | clean, delete (left deleted it) |
| `remove-right.txt` | present | same as base | absent | clean, delete (right deleted it) |
| `added-left.txt` | absent | present | absent | clean, take left addition |
| `added-right.txt` | absent | absent | present | clean, take right addition |
| `conflict.txt` | present | line 2 changed | line 2 changed differently | conflict at line 2 |
| `sub/inner.txt` | present | line 2 changed | same as base | clean, take left (nested file) |

The folder merge therefore has five clean one-sided changes (`edit-left.txt`,
`edit-right.txt`, `sub/inner.txt`, `added-left.txt`, `added-right.txt`), two
clean one-sided deletions (`remove-left.txt`, `remove-right.txt`), one
unchanged file (`common.txt`) and one conflict (`conflict.txt`).

## `git-roundtrip.mjs`

Run `node test/fixtures/merge/git-roundtrip.mjs <target-dir>` to create a
git repository with one unresolved conflict. The script reads the three
fixture files from its own directory and writes only inside `<target-dir>`.

The script commits `base.txt` as `doc.txt` on `main`. Branch `left` commits
`left.txt` as `doc.txt`. Branch `right` starts from `main` and commits
`right.txt` as `doc.txt`. The script then checks out `left`, merges `right`
and leaves the conflict in the working tree. It prints the absolute path of
`doc.txt` and the `git status --porcelain` lines.

The script is deterministic: it sets a fixed author, committer and date, and
sets `core.autocrlf=false`. Two runs produce the same commit ids. The exit
codes are 0 on success, 2 when `<target-dir>` exists and is not empty, and 3
when `git` is not on `PATH`.
