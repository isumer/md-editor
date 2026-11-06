review: deep

# Slice 5 fix 3 — test the tab modules (send-back of job 876)

Work on branch `bug/slice-5-fix-2` (tip `dd7bc2c`). Run `git merge origin/main`
first. The goals of `slice-5.md`, `slice-5-fix.md` and `slice-5-fix-2.md` still
hold. Add no features. No new dependencies. Commit after each item. Show a red
test first where the item changes behaviour (AGENTS.md).

## State of the branch (review of job 876)
- Fix-2 items 1-5 are done. The review commit `dd7bc2c` carries the
  first-pass fixes (close broker `finally`, incomplete preview resume,
  preload snapshot and trusted-drop test, e2e platform chords, AC-R4-02 tag).
  Keep them.
- Green: typecheck, check:deps, test:unit (570), acceptance, licences.
- Red: `check:coverage`. Statements 89.23% (baseline 99.04%), branches 92.20%
  (97.34%), functions 88.29% (98.81%), lines 89.43% (99.14%).
- E2E x3 on `160ac37`: 231 passed; AC-PERF-09 red on this Pi only.

## Findings

1. **Blocker — the new tab modules are untested.** Fix-2 item 4 required unit
   tests for each new file under `src/renderer/tabs/`. Line coverage now:
   `documentLifecycle.ts` 0.7%, `renderController.ts` 1.6%, `tabStrip.ts`
   1.9%, `closePrompt.ts` 10.5%, `documentCommands.ts` 11.4%.
   `test/unit/tabs.test.ts` calls five pure helpers only. Write one unit test
   file per module (`test/unit/tabs<Module>.test.ts`). Drive each module
   through its public functions with jsdom and real collaborators; fake only
   the `window.api` boundary and timers. Do not mock our own modules. Cover:
   - `documentLifecycle`: open a tab; focus a tab whose path is already
     open; close clean and dirty; save and save-as; session snapshot and
     restore; path adoption after save-as; a failed open keeps the current
     document.
   - `renderController`: heartbeat ping and timeout; worker restart; epoch
     change; `show() === false` schedules a render; tab close drops the
     cached preview.
   - `tabStrip`: render, stable labels, dirty marker, activate, close.
   - `closePrompt`: one file and many files; Cancel, Discard and Save.
   - `documentCommands`: the fixed menu ids and command dispatch.
   Each test must fail when its behaviour breaks: name one mutation per
   module in the report and paste its red output. If a module is hard to
   test, change its shape (inject the dependency) and say so; add no
   test-only branch in `src`.

2. **Major — `drop()` in the preview cache is untested.** In
   `src/renderer/features/preview/preview.ts`, removing
   `previews.delete(docId)` from `drop()` leaves every unit test green. A
   closed tab then leaks its block container. Test: render a document, drop
   it, then `show()` for the same version returns false and attaches no
   node. Tag AC-R4-01.

3. **Major — a renderer can settle another window's close request.**
   `CloseRequestBroker.settle` (`src/main/app/closeRequests.ts`) finds the
   pending close by id only. Ids are sequential. The renderer of window A
   can answer window B's request: B closes without its prompt, and the
   session snapshot holds A's documents. Fix: store the window id in each
   pending close; `settle` ignores a result whose window id differs and
   keeps the request pending. Test in `test/unit/closeRequests.test.ts`: a
   request for window 1 settled from window 2 stays pending and persists
   nothing; the same result from window 1 settles it. Tag AC-SEC-07.

4. **Minor — `preview.ts` has 506 lines.** AGENTS.md allows 400. Move the
   per-document cache (`DocumentPreview`, `PreviewDocuments` and their
   functions) into `src/renderer/features/preview/previewDocuments.ts`.
   Keep behaviour the same. No lint exception.

5. **Check — the incomplete-preview resume (first-pass fix).** `show()` now
   returns false for a cached preview whose render is not complete. Prove
   it in e2e (`test/e2e/tabs.spec.ts`): open a large document, switch away
   before the fill completes, switch back, and expect
   `data-render-complete="true"` in the end. Use the platform constants
   from `test/e2e/helpers.ts` for every key press.

## Notes (do not change)
- Hot exit at quit stays (AC-R4-08). The reviewer fixes the AC-R4-06 wording
  at merge.
- AC-PERF-09/10/11 are information only on this Pi. Report the numbers.

## Allowed files
`src/renderer/tabs/{documentLifecycle,renderController,tabStrip,closePrompt,documentCommands}.ts`
(testability changes only), `src/renderer/features/preview/preview.ts`,
new `src/renderer/features/preview/previewDocuments.ts`,
`src/main/app/closeRequests.ts`, `src/renderer/main.ts` (only if a module
signature changes). Tests: new `test/unit/tabs*.test.ts`,
`test/unit/{tabs,preview,closeRequests}.test.ts`, `test/e2e/tabs.spec.ts`.
Nothing else. Do not edit `coverage-baseline.json`, package.json, workflows,
coverage config, acceptance docs, PLAN, architecture or ADRs.

## Done means
`npm run typecheck`, `npm run check:deps`, `npm run test:unit`,
`npm run check:coverage` and `npm run build` exit 0 — paste each. Coverage
must be within 0.1 points of the baseline on every metric. Then
`node scripts/run-e2e.cjs --repeat-each 3` is green except the
information-only perf tests — paste the summary. Give red evidence for each
item. List the changed files.
