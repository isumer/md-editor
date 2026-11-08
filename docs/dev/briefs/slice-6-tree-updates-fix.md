# Slice 6 tree updates fix — brief edit and missing proof (dev lane)

Base: main (continues the PR branch feature/slice-6-tree-updates)

The Vision gate on candidate 501e728 found four confirmed gaps. This
fix removes an out-of-scope brief edit and adds the five missing
tests. The module source `src/shared/workspace/treeUpdates.ts` is
correct and must not change. Do not add wiring, IPC or dependencies.

The module is not wired yet. AC-R11-05 stays planned. No CHANGELOG
entry.

## Findings
1. Major - scope. The branch edits
   `docs/dev/briefs/slice-6-tree-updates-side.md`, which is not on
   the allowed list. The edit's content (a local node shape instead
   of an import from `./treeRows`) is right: `src/shared` modules
   have no imports. The reviewer has landed that correction on main.
   The branch must drop its own edit of the brief.
2. Major - rule 1's `.` guard has no test. Removing
   `segment === "."` from the guard leaves all 11 tests green. The
   existing invalid-path forms never bite: a mid-path `.` or `..`
   segment matches no node, so the tree stays unchanged even without
   the guard. Only a terminal `.` (or `..`) segment shows the guard.
3. Major - rule 3's case-insensitive order has no test. Removing
   both `toLowerCase()` calls leaves all 11 tests green; every test
   name is lowercase.
4. Major - rule 5 has two untested guards. Removing
   `openPath === change.path` leaves all tests green (no test closes
   an exactly deleted clean file). Replacing the
   `openPath.startsWith(`${change.path}/`)` boundary with a raw
   prefix also leaves all tests green (no test keeps an unrelated
   prefix such as `notebook/a.md` when `note` is deleted).

Backslash is also untested. Rule 1 defines a closed invalid list; a
backslash is not in it, so a backslash is a literal name character,
not a separator. Pin that behaviour with a test. The slice 6 wiring
item must pass only normalized `/`-separated workspace-relative
paths (the workspace-paths module normalizes OS separators); a
Windows backslash path reaching this module would create a wrongly
named node. That is the wiring's defect, not this module's.

## The brief revert
Restore `docs/dev/briefs/slice-6-tree-updates-side.md` to main's
version: `git restore origin/main -- docs/dev/briefs/slice-6-tree-updates-side.md`.
After the revert the file must be byte-identical to origin/main's.

## Tests to add (red first)
Add these to `test/unit/workspaceTreeUpdates.test.ts`, in the style
of the existing tests. Keep every existing test unchanged. Every
title starts `AC-R11-05:`.

1. In `refuses an invalid path`, add three `created` assertions on a
   tree with a folder that has children (use the `notes` tree of the
   neighbouring tests): paths `notes/.`, `notes/..` and `.` each
   leave the tree unchanged (`toBe(nodes)`). Mid-path forms stay as
   they are.
2. `treats a backslash as a literal name` - tree
   `[notes (folder, children [a.md])]`. Create `notes\b.md` (one
   backslash, in the path string). Expect the result to equal
   `[notes, { name: 'notes\\b.md', kind: 'file' }]` and
   `updated[0]` to be `notes` (the folder object is kept).
3. `adds a case-insensitively equal name after the existing entry` -
   tree `[Apple.md, banana.md]` (files). Create `apple.md`. Expect
   the names in order `['Apple.md', 'apple.md', 'banana.md']`. The
   names are equal case-insensitively, so the stable sort keeps the
   existing entry first.
4. In `closes only a deleted clean file`, add:
   `decideOpenFile({ kind: 'deleted', path: 'notes/a.md' }, 'notes/a.md', false)`
   equals `'close'` (the exactly deleted clean file).
5. In `closes only a deleted clean file`, add:
   `decideOpenFile({ kind: 'deleted', path: 'note' }, 'notebook/a.md', false)`
   equals `'keep'` (an unrelated prefix stays open).

## Red evidence
Run each mutation alone, then restore. For each run, the named test
must fail and every other test in the file must pass. Paste all runs.
1. Remove `segment === "."` from the guard: the terminal-`.` and
   bare-`.` assertions fail.
2. Remove `segment === ".."` from the guard: the `notes/..` assertion
   fails.
3. Change `path.split("/")` to `path.split(/[/\\]/)`: the
   backslash test fails.
4. Remove both `toLowerCase()` calls in `compareNodes`: the
   mixed-case test fails.
5. Remove `openPath === change.path ||`: the exact-path assertion
   fails.
6. Change `openPath.startsWith(`${change.path}/`)` to
   `openPath.startsWith(change.path)`: the unrelated-prefix
   assertion fails.
7. Restore everything. The whole file passes.

## Allowed files
`test/unit/workspaceTreeUpdates.test.ts` and
`docs/dev/briefs/slice-6-tree-updates-side.md` (revert to main's
version only). Nothing else. `src/shared/workspace/treeUpdates.ts`
must not change.

This branch continues the unmerged PR feature/slice-6-tree-updates.
A three-dot diff against main therefore names the PR's own module,
`src/shared/workspace/treeUpdates.ts`. That file is PR content, not
a change of this fix. Judge this brief's scope on the fix commit,
not on the whole PR diff. A reviewer may remove dead branches from
the module to meet the coverage ratchet, and records that change in
the merge message.

## Done means
- `git diff --stat HEAD^ HEAD` (the fix commit) names only
  `test/unit/workspaceTreeUpdates.test.ts`, and
  `git diff origin/main...HEAD -- docs/dev/briefs/slice-6-tree-updates-side.md`
  is empty.
- `npm run typecheck`, `npm run check:deps`, `npm run test:unit`
  exit 0; paste their summary lines.
- Run `npm run verify` when the Electron lock is free. Do not wait
  more than 10 minutes for it. If AC-PERF-09/10/11 fails on this
  machine, note the number and move on.
- Commit on the PR branch. Do not amend or rebase existing commits.
