# Side — Slice 11 conflict-style fixtures

**Base: main.** Runs alongside the current slices. This task writes only
new files under `test/fixtures/merge/conflict-styles/`. It is file-disjoint
from every queued or running item.

Slice 11 (PLAN "Slices" §11) must detect conflict-marker files. Git writes
conflict markers in three styles: `merge`, `diff3` and `zdiff3`. The merge
view must parse all three. This task adds one small file per style and a
README that states the expected parse result.

## Deliverables
- `test/fixtures/merge/conflict-styles/base.txt`, `left.txt`, `right.txt`
  — the three merge inputs. Plain ASCII with LF endings. `left.txt` and
  `right.txt` each change two regions of `base.txt` in different ways, so
  the merge has exactly two conflicts. Put at least two unchanged lines
  between the regions.
- `test/fixtures/merge/conflict-styles/merge.txt`, `diff3.txt`,
  `zdiff3.txt` — the same merge in the three styles. Do not hand-write the
  markers: generate each file with `git merge-file` from the three inputs,
  so the markers match real git output:
  - `git merge-file -p -L left -L base -L right left.txt base.txt right.txt > merge.txt`
  - the same command with `--diff3` writes `diff3.txt`;
  - the same command with `--zdiff3` writes `zdiff3.txt`.
  `git merge-file` exits with the number of conflicts (2). Do not treat a
  non-zero exit as a failure. `--zdiff3` needs git 2.35 or later; if the
  local git is older, stop and report it.
  Each style file must contain exactly two conflict regions. Each region
  must show text that differs from the base on both sides.
- `test/fixtures/merge/conflict-styles/README.md` — one short file. It must
  state, for each style file: the marker form, the line number of every
  marker, the number of conflicts (2), and the exact left, base and right
  text of each conflict.

## Verify
- Paste `git --version`.
- Paste each of the four generated files.
- Paste `grep -n '^<<<<<<<\|^=======\|^>>>>>>>\|^|||||||' <file>` for each
  style file. The marker counts must match the README.
- Negative control: paste `grep -c '^|||||||' merge.txt` (0) and
  `grep -c '^|||||||' diff3.txt` (2). This shows the styles differ.
- `npm run verify` stays green (fixture-only).

## Allowed files
`test/fixtures/merge/conflict-styles/**` (new folder only). Nothing else —
no src, no test/unit, no test/e2e, no other fixture folder, no docs, no
coverage config, no workflows.

## Done means
List changed files. Paste the git version. Paste the four files. Paste the
line-numbered marker lists and their counts. Paste the negative control.
Paste `npm run verify` output.
