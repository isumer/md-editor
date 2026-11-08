review: deep

# Slice 10 part 1 — line and word diff module (R14)

Base: main

Branch `feature/slice-10-line-diff`. Follow AGENTS.md. Pure module only:
no UI, no wiring, no new dependency. Commit after each finding.

## What
Build the diff engine that the compare views will consume. It runs in the
existing per-job worker (architecture §3, §4.2), so it is a pure module
that takes two texts and returns changes. No DOM, no Electron, no I/O.

Line diff (`src/shared/diff/lineDiff.ts`):
- `diffLines(left, right, options)` returns hunks in document order. A
  hunk is either an unchanged run or a change hunk.
- In a change hunk, pair deleted lines with added lines at the same
  position. A line only on the left is `deleted`, only on the right is
  `added`, a paired line is `modified` and carries both line numbers.
- An unchanged run carries its line count, so the UI can collapse it
  (AC-R14-09).
- Options: `ignoreTrailingWhitespace`, `ignoreCase`, `ignoreLineEndings`
  (CR, LF and CRLF are equal when it is on). AC-R14-08.
- The input is an array of lines. Do not join or copy the whole text.
- Two 20 MB inputs (about 200,000 lines) must complete without quadratic
  memory. Use Myers O(ND) with a bound, then fall back.

Word diff (`src/shared/diff/wordDiff.ts`):
- `diffWords(left, right, options)` returns spans marked same or changed
  for one modified line pair (AC-R14-02). Split on word boundaries and
  whitespace. The caller highlights only the changed spans.
- A work limit returns `{ limited: true }` with no spans, so the caller
  shows the coarser line diff and a notice (AC-R14-11).

## Allowed files
New: `src/shared/diff/lineDiff.ts`, `src/shared/diff/wordDiff.ts`,
`test/unit/lineDiff.test.ts`, `test/unit/wordDiff.test.ts`.
Nothing else.

## Tests (red first)
Tag each test with its criterion id. The criteria stay `planned` until the
compare wiring proves them. Do not edit `docs/acceptance/`.
- AC-R14-01: a line added, deleted and modified between two texts; assert
  the exact hunk list and line numbers.
- AC-R14-02: one changed word in a modified line; assert the exact spans.
- AC-R14-08: each ignore option, on and off, with one test per option.
- AC-R14-09: a 1,000-line pair with one change gives one unchanged run on
  each side with exact counts.
- AC-R14-11: a word pair over the limit returns `limited: true`, and the
  line diff still returns.
- Boundaries: two empty inputs, identical inputs, fully different inputs,
  one empty side.
- A 200,000-line pair completes and returns (no wall-clock assertion; the
  Pi runs perf as information only).
- Property: 200 seeded random pairs; applying the hunks rebuilds both
  inputs exactly.

## Red evidence
Run the tests before the implementation and show them red in the report.

## Done means
`npm run typecheck` and both unit files green; coverage ratchet green. No
threshold change, no new dependency, no test-environment branch.
