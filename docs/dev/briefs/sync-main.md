# Sync a PR branch with main (conflict resolution)

The pipeline merged `origin/main` into this PR branch after another PR landed, and
the merge stopped on conflicts. The merge is still open in the working tree: the
conflicted files contain `<<<<<<<` / `=======` / `>>>>>>>` markers.

## Task
1. Find every conflicted file (search for the markers) and resolve each conflict so
   that **both** sides keep working: main's behaviour and this PR's change. Read the
   brief of the PR (under docs/dev/briefs/) and the main-side change before choosing.
2. `docs/dev/work-graph.md` and acceptance status lines: main's copy wins; then
   re-apply only this PR's own rows/lines.
3. Change nothing beyond what the conflict needs. No new features, no refactors,
   no budget or retry changes, no skipped tests.
4. Do not commit and do not run git commands that end or abort the merge; the
   pipeline commits the merge after `npm run verify`.
5. Run `npm run verify`. No conflict markers may remain anywhere.

## Allowed files
Only the conflicted files, plus the minimum follow-up edits the merged code needs
to compile and pass its tests.
