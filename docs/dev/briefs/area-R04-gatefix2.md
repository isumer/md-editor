# Fix brief: area-R04 gatefix round 2 (remaining gatefix1 findings)

Base: continue `feature/area-R04` (this fix job continues its own PR branch).

The gatefix1 round settled the clone-close data loss (F2: done, tests green).
Two gatefix1 findings stay open. Do not add any other change to this round.

## G1 (blocker, CI red the fix round introduced)

The TEMP F1 attribution probe in
`test/e2e/document-views.spec.ts` (the "TEMP F1 attribution" comment block,
the `page.evaluate` PerformanceObserver install, the `__lt` plumbing, the
`cdpMs`/`console.log` line in "AC-R4-11: cloned-view keystroke updates stay
under 16 ms at p95") breaks typecheck. CI run 43450963262, job
"Test (ubuntu-latest)": `document-views.spec.ts(429,25) error TS2339:
Property 'attribution' does not exist on type 'PerformanceEntry'` and
`(429,42) error TS7006`. All three Test jobs die at Typecheck before any
test runs.

Fix: delete the probe completely. Keep the MutationObserver page-side
measurement, SAMPLES and WARM_UP_SAMPLES, the 16 ms p95 assertion, the
retry and timeout values, and the `["@AC-R4-11", "@AC-PERF-12"]` tag.
Attribution numbers belong in your job report, never in committed code.
Do not edit `docs/acceptance/PERF-response-time.md`: it is protected and
this brief does not permit it; `@AC-PERF-12` stays a tag-only id.

F1's owed proof: the p95 row green in CI on ubuntu, windows and macos on
the new candidate. If it is red there, read the sample lines from the log,
name the stall source, and fix the product source. Never widen the
threshold, the sample count, the retries or the timeout.

Proof: `npm run typecheck` green (tsconfig.test.json checks tests) and
`node scripts/run-e2e.cjs --grep "cloned-view keystroke"` green.

## G2 (major, gatefix1 finding F3 — skipped by the fix round)

Revert the branch's unrelated and protected work. Check each file with
`git diff origin/main -- <file>` first so no R04 wiring is lost.

Whole-file revert to `origin/main` (use
`git checkout origin/main -- <file>`):

- `.github/workflows/ci.yml`
- `scripts/check-acceptance.mjs`
- `src/renderer/workers/render/render.ts`
- `src/shared/diff/lineDiff.ts`
- `test/unit/checkAcceptance.test.ts`
- `test/unit/lineDiff.test.ts`
- `test/unit/editor.test.ts`
- `test/unit/fileDialogs.test.ts`
- `test/unit/main.test.ts`
- `test/unit/preload.test.ts`
- `test/unit/workspaceService.test.ts`

Notes:

- The split-JUnit `ACCEPTANCE_JUNIT_REPORTS` line is redundant on CI:
  main's "Merge end-to-end test reports" step already folds
  `perf-e2e-junit.xml` into `e2e-junit.xml` before check:acceptance.
- In `src/renderer/editor/editor.ts` revert only the plain-Markdown
  fast-path hunk: `plainMarkdownTemplate`, `plainMarkdownParagraph`,
  `plainMarkdownPattern`, the `MarkdownTree` type and constructor,
  `plainMarkdownParse`, and the `wrap:` entry inside `markdownSupport`.
  Keep the R04 wiring: `deferDirtyState`, `callbacksCompartment`,
  `callbacksExtension`, `editorCallbacksEffect`, the compartment in
  `createEditorState`, the `handleDocumentUpdate` observer ordering and
  the unguarded `setEditorDarkTheme`.
- In `CHANGELOG.md` keep the three R04 lines but drop the clause "and a
  document made of one very long plain line no longer needs a full
  Markdown scan to highlight" — that behaviour leaves with the revert.

## Allowed files

`test/e2e/document-views.spec.ts`, `src/renderer/editor/editor.ts`,
`CHANGELOG.md`, plus whole-file reverts of the G2 list. No other file.

## Done means

- `git diff --stat origin/main...HEAD` lists none of the G2 file paths or
  the fast-path hunk.
- `npm run typecheck`, `npm run test:unit` and the targeted e2e set
  (`node scripts/run-e2e.cjs --grep-invert @AC-PERF test/e2e/document-views.spec.ts
  test/e2e/editor.spec.ts test/e2e/preview.spec.ts test/e2e/tabs.spec.ts`)
  pass.
- The clone-close tests from gatefix1 stay green; do not touch them.
