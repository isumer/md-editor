review: deep

# Slice 10 part 1b — line diff that stays exact on large files (R14)

Base: main

Branch `feature/slice10-line-diff-anchors`. Follow AGENTS.md. Pure module
only: no UI, no wiring, no new dependency.

Depends on: slice10-line-diff (must be on main before this item starts).

## Why
`diffLines` runs one bounded Myers pass over the whole middle region
(`MAX_EDIT_DISTANCE` 512). AC-R14-10 has 1 % of 200,000 lines changed.
That is about 4,000 edits, so today the whole region falls back to one
coarse change hunk. A compare view would show every line as changed.

## What
- Split the middle region on anchors: lines that occur exactly once on
  each side (after the ignore options), kept in order by a longest
  increasing subsequence (patience diff). Run the bounded Myers pass on
  each gap between anchors. The bounds apply per gap.
- Fall back to coarse edits per gap only, never for the whole file.
- `diffLines` returns `{ hunks, limited }`. `limited` is true when any
  gap fell back. The UI uses it for the AC-R14-11 notice. Keep the hunk
  types unchanged.
- The input stays an array of lines. Do not join or copy the whole text.
  Memory stays linear in the line count.
- Keep the linear `withoutTrailingBlanks` normalization. No regex that
  can backtrack over a line.

## Allowed files
`src/shared/diff/lineDiff.ts`, `test/unit/lineDiff.test.ts`. Nothing else.

## Tests (red first)
Tag each test with its criterion id. Do not edit `docs/acceptance/`.
- AC-R14-10: 200,000 lines, every 100th line changed: exactly 2,000
  change hunks, each with one modified line, and `limited` false.
- AC-R14-11: a gap over the bound gives `limited` true. The other gaps
  stay exact. Assert the exact hunks.
- A test that reaches the work bound (not the distance bound) and goes
  red when the work bound is removed. If no input can reach it, remove
  the bound and say why in the report.
- Keep the existing tests and the 200-seed rebuild property; update them
  to the new return shape only.

## Red evidence
Run the new AC-R14-10 test on the old code (red: one coarse hunk). Paste.

## Done means
`npm run typecheck`, `npm run check:deps`, both unit files and the
coverage ratchet exit 0. No threshold change, no new dependency.
