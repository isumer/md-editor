# Low-resource 4: cold start — fix 1 (AC-PERF-03)

Base: continues `feature/1329-1288-lowres-4-cold-start-vfix` (fix job; work on
that branch, do not reset it to main).

Owner 2026-11-10: AC-PERF-03 (argv file editable within 2 s) failed on macOS
at 2104 ms. Make startup cheaper; the budget is never widened.

## Review findings (job 1342; every one must be fixed)

1. Blocker: `src/renderer/editor/editor.ts` is outside the allowed files and
   its language fallback is broken. `hasLongInitialLine` treats "no line
   break until the end of the string" as a long line: `nextLineBreak`
   returns -1 and the -1 is read as a long line. Production always passes
   strings (`src/renderer/main.ts` newDocument and the empty-state reset,
   `createEditor`'s initial state), so every document whose last line starts
   within the first 3000 characters gets the no-op `StreamLanguage`: the
   empty document, every untitled document, every small file. The real
   `markdown()` parser, its highlighting and folding are gone for typical
   documents. Review probe: "# Small document", "", "line one\nline two" and
   "# Title\n\ntext\n" all resolved to the StreamLanguage.
2. Blocker: the fallback `StreamLanguage` is named "markdown", so the name
   assertions in `test/unit/editor.test.ts` pass with the parser removed.
   The new logic has no test of its own.
3. Major: the AC-PERF-03 fixture (test/fixtures/sample.md, 48 bytes, no
   trailing newline) hits that bug. The measured cold-start gain is the
   removal of markdown parsing from the test's own document, not a cheaper
   startup path.
4. Major: brief tasks 2 (lazy dynamic import() of secondary features) and
   3 (V8 code caching) are not implemented.

## Task

1. Revert `src/renderer/editor/editor.ts` to main
   (`git checkout origin/main -- src/renderer/editor/editor.ts`). Do not
   change the editor language selection in this slice; the markdown language
   stays on the first screen.
2. Keep the performance marks and the marks assertion in
   `test/e2e/io-worker.spec.ts` (original task 1; the review verified the
   assertion by mutation).
3. Implement the original task 2: move features not needed for the first
   screen off the path to "editable" with dynamic `import()` after the editor
   is editable: export, compare, merge, settings panels, the menus'
   secondary items, update check. The preview worker start stays early.
   Each lazy module keeps its behaviour; only its load time moves.
4. Implement the original task 3: enable V8 code caching for the renderer
   bundle if the build allows it (bundler or runtime cache option;
   `v8.setFlagsFromString` is not allowed). If the build does not allow it,
   say so in the report and name the reason.
5. Marks fire once: `file-text-shown` and `editor-editable` currently fire on
   every activation of a granted document. Mark each name at most once.
6. No behaviour change visible to the user except speed; all e2e tests
   green. Every new module gets unit tests with criterion ids and red
   evidence for its guards.

## Allowed files
`src/renderer/main.ts`, renderer feature registration files under
`src/renderer/features/`, `src/renderer/editor/editor.ts` (revert only),
`test/e2e/io-worker.spec.ts`, build config, unit tests for new modules,
`CHANGELOG.md`.
