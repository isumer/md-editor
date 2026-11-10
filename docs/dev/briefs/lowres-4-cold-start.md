# Low-resource 4: cold start — file editable sooner (AC-PERF-03)

Owner 2026-11-10: AC-PERF-03 (argv file editable within 2 s) failed on macOS at 2104 ms. Make startup cheaper; the budget is never widened.

## Task
1. Measure first: add `performance.mark`s (main process and renderer) for app ready, window created, renderer script start, editor mounted, file text shown, editable. Print them once in the AC-PERF-03 test output.
2. From the marks, move work off the path to "editable": features not needed for the first screen (preview worker start can stay early; export, compare, merge, settings panels, menus' secondary items, update check) load lazily with dynamic `import()` after the editor is editable.
3. Enable V8 code caching for the renderer bundle if the build allows it (Electron `v8.setFlagsFromString` is not allowed; use the bundler/runtime cache option), and show the before/after marks.
4. No behaviour change visible to the user except speed; all e2e tests green.

## Allowed files
`src/main/main.ts`, renderer entry and feature registration files, `test/e2e/io-worker.spec.ts` (marks output only), build config.
