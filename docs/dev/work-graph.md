# Work graph

One row per work item. Two queued or running items never own the same file.
Depends-on names merged items where possible. Lanes: dev, side, nim.
Update a row when an item is queued, merged or sent back.

| id | slice | owned files | depends on | lane | status |
| --- | --- | --- | --- | --- | --- |
| 039 → fix-2 | 4 | src/renderer/features/preview/**, src/renderer/workers/render/**, src/renderer/main.ts, src/renderer/styles.css, src/shared/workers/render.ts, preview test files (see brief slice-4-fix-2.md), test/e2e/preview*.spec.ts | main; branch auto/039-slice-4-fix-review | dev (Vision) | merged (cc087b6) |
| 041 | 5 | listed files only (brief slice-5-fix-5.md: documentLifecycle.ts, en.ts, tabs unit tests) | slice 4 (stacked) | dev (Vision) | sent back 2026-11-08 (gate on candidate 770bb54): Save As check-to-write race; fix queued (slice-5-fix-5) |
| slice6-tree-model | 6 | src/shared/workspace/treeRows.ts, test/unit/workspaceTreeRows.test.ts | main | dev | merged (main) |
| 040 | 8 | test/fixtures/powertools/** | main | side | merged (feb37f0) |
| outline-fixtures | 8 | test/fixtures/outline/** | main | side | merged (de72ccb) |
| 042 | 13 | export fixtures under test/fixtures/export/** | main | nim | merged (70d4ea9) |
| 054 | 6 | test/fixtures/workspace/** | main | side | merged (b6c2dac) |
| 055 | 14 | test/fixtures/stability/** | main | nim | merged (297b898) |
| bin-detect | 7 | src/shared/text/binary.ts, test/unit/binaryDetection.test.ts | main | side | merged (1c7481b) |
| log-fixture | 7 | test/fixtures/log/** | main | side | merged (47a2609) |
| md-boundaries | 4 | test/fixtures/markdown-boundaries/** | main | side | merged (092003d) |
| find-replace-fx | 7 | test/fixtures/find-replace/** | main | nim | merged (20faee8) |
| compare-gen | 10 | test/fixtures/compare/generate-folders.mjs, test/fixtures/compare/README.md | main | side | merged (ce1e212) |
| replace-in-files-fx | 8 | test/fixtures/replace-in-files/** | main | nim | candidate 8035265 |
| git-roundtrip-fx | 11 | test/fixtures/merge/git-roundtrip.mjs, test/fixtures/merge/README.md | main | side | merged (82c7b0a) |
| conflict-style-fx | 11 | test/fixtures/merge/conflict-styles/** | main | side | merged (0724cc9) |
| gate-fixture-readmes | — | test/fixtures/depcruise/README.md, test/fixtures/fuses/README.md, test/fixtures/licenses/README.md | main | side | candidate de06eb1 |
| slice7-language-module | 7 | src/shared/text/language.ts, test/unit/language.test.ts | main | nim | merged (main) |
| languages-fixture-readme | 7 | test/fixtures/languages/README.md | main | side | merged (main) |
| slice7-line-endings | 7 | src/shared/text/lineEndings.ts, test/unit/lineEndings.test.ts | main | nim | review (887) |
| slice7-find-replace | 7 | src/shared/text/findReplace.ts, test/unit/findReplace.test.ts | main | side | merged (main) |
| slice6-tree-generator | 6 | test/fixtures/workspace/generate-tree.mjs, test/fixtures/workspace/README.md | main | dev | done (870); verify red on Pi perf only; review pending |
| slice7-binary-open | 7 | src/io-worker/services/file.ts, src/shared/ipc/result.ts, src/shared/messages/en.ts, test/unit/ioWorker.test.ts, test/e2e/binary-open.spec.ts | main (binary.ts merged) | dev (Vision) | merged (aeab698) |
| slice12-settings-module | 12 | src/shared/settings/settings.ts, test/unit/settings.test.ts | main | side (Edith) | merged (5b4a267) |
| slice8-outline-module | 8 | src/shared/outline/outline.ts, test/unit/outline.test.ts | main | nim (Karen) | merged (7ad9c3b) |
| slice6-workspace-paths | 6 | src/shared/workspace/workspacePath.ts, test/unit/workspacePath.test.ts | main | dev (Vision) | merged (e1ee930) |
| io-port-restart | 5 (bug) | src/main/io/ioWorker.ts, src/main/main.ts, src/preload/preload.ts, src/shared/ipc/io.ts, test/unit/{ioSupervisor,preload,ioContracts}.test.ts | 041 (on main first) | dev (Vision) | sent back 2026-11-07: e3bad31 macOS-red (AC-R1-12; lacks 041 83a6ac5). Fix brief io-port-restart-fix.md WAITS: queue it (Vision, name io-port-restart-fix) only after 041 lands |
| macos-e2e | 9 | test/e2e/commands.spec.ts, test/e2e/save-contracts.spec.ts, test/e2e/preview-perf.spec.ts, test/e2e/helpers.ts, .github/workflows/ci.yml | main | side (Edith) | candidate e00eb4a |
| slice8-word-completion | 8 | src/shared/text/wordCompletion.ts, test/unit/wordCompletion.test.ts | main | nim (Karen) | sent back 2026-11-08 (gate 935, candidate aad8ad9): per-code-unit scan rejects non-BMP letters, one-character wordAt and default-20 limit untested. Fix queued (brief slice-8-word-completion-fix.md, dev lane) |
| merge-conflict-markers | 11 | src/shared/merge/conflictMarkers.ts, test/unit/conflictMarkers.test.ts | main | dev (Vision) | queued (brief slice-11-conflict-markers-module.md) |
| slice6-tree-updates | 6 | src/shared/workspace/treeUpdates.ts, test/unit/workspaceTreeUpdates.test.ts | main (treeRows merged) | dev (Vision) | sent back 2026-11-08 (gate 941, candidate 501e728): branch edits the side brief; terminal `.`/`..`, backslash-literal, case-insensitive order, rule 5 exact-path and descendant boundary untested. Fix queued (brief slice-6-tree-updates-fix.md, continues feature/slice-6-tree-updates) |
| slice6-tree-store | 6 | src/renderer/features/workspace/treeStore.ts, test/unit/workspaceTreeStore.test.ts | main (treeRows merged) | dev (Vision) | merged (fc60fa2) |
| slice7-encoding-module | 7 | src/shared/text/encoding.ts, test/unit/encoding.test.ts | main | nim (Karen) | candidate 7260be4 (reviewed merge); branch a9a88eb unmerged — needs a merge decision |
| slice8-line-operations | 8 | src/shared/lines/lineOperations.ts, test/unit/lineOperations.test.ts | main | dev (Vision) | merged (f719ffd) |
| slice8-column-editor | 8 | src/shared/lines/columnEditor.ts, test/unit/columnEditor.test.ts | main | dev (Vision) | merged (1cebe83) |
| slice9-views-sync-scroll | 9 | src/renderer/features/views/**, sync-scroll/** except mapping.ts (see slice9-sync-scroll-mapping), their tests; minimal registration files (brief slice-9-views-sync-scroll.md) | main | dev (Vision) | brief on main (44c27c5); 13a is on main; now waits for perf-open-long-task-2 (944 owns preview.ts and workers/render). The wiring brief must use the mapping module |
| slice10-line-diff | 10 | src/shared/diff/lineDiff.ts, src/shared/diff/wordDiff.ts, test/unit/{lineDiff,wordDiff}.test.ts | main | dev (Vision) | merged b2bc72e |
| slice13a-export | 13 | export module, main export dir, tests, fixtures; registry and message registration (brief slice-13-export.md) | main | dev2 (Vision) | Friday gate passed 2026-11-07 (merge on d6bc525; AC-R6-02/-04 back to planned for 13b); lands when CI is green |
| update-policy | 14 | src/shared/update/updatePolicy.ts, test/unit/updateVersion.test.ts, test/unit/updateFeed.test.ts, test/unit/updatePolicy.test.ts | main | dev (Vision) | running (931) |
| slice10-folder-compare | 10 | src/shared/diff/folderCompare.ts, test/unit/folderCompare.test.ts | main | dev (Vision) | sent back 2026-11-07 (gate 958, candidate e71c58e): right-only error branch untested; fix queued (brief slice10-folder-compare-fix.md) |
| slice12-appearance | 12 | src/shared/settings/appearance.ts, test/unit/appearance.test.ts | main | nim (Karen) | candidate 7bd78ae (Evren fallback review fixed strict hex parsing; merge awaits CI; AC-R7-01..04 stay planned until wiring) |
| slice14-update-feed-fixtures | 14 | test/fixtures/update/** | main | side (Edith) | queued (939; brief slice-14-update-feed-fixtures-side.md) |
| perf-open-long-task-2 | 4 (bug) | src/renderer/features/preview/{preview,renderScheduler}.ts, src/renderer/workers/render/{handler,incremental,chunks}.ts, src/renderer/main.ts and src/shared/workers/render.ts (only if the measurement names them), their unit tests, test/e2e/preview-perf.spec.ts (message and marks only) | main | dev (Vision) | sent back 2026-11-08 (review of 90175cd): fix 4 removed the 4-block deferral to measure a before build and committed that state, so test/unit/preview.test.ts:161 is red; it also committed the forbidden probe test/e2e/perf-window-probe.spec.ts and wrote no report. Measured at 6x with the deferral: windowed tasks of 111/123 ms, cause unnamed, starting after preview-apply-end. Fix brief perf-open-long-task-5.md continues branch feature/perf-open-long-task-2; owns main's macOS AC-PERF-10 red |
| slice8-user-bindings | 8 | src/shared/keymap/userBindings.ts, test/unit/userBindings.test.ts | main | nim (Karen) | queued (945; brief slice-8-user-bindings-module-nim.md) |
| slice11-merge-chunks | 11 | src/shared/merge/mergeChunks.ts, test/unit/mergeChunks.test.ts | main | dev (Vision) | candidate c7be53e (fix 6261cfe adds the AC-R15-04 reversed-range test; Evren fallback review; merge awaits CI; AC-R15-04/-05/-10 stay planned until wiring) |
| slice8-palette-match | 8 | src/shared/commands/paletteMatch.ts, test/unit/paletteMatch.test.ts | main | dev (Vision) | candidate 6d95d84 (reviewed by Edith; merge decision with Friday or Jarvis; AC-R13-06 stays planned) |
| slice10-line-diff-anchors | 10 | src/shared/diff/lineDiff.ts, test/unit/lineDiff.test.ts, test/unit/wordDiff.test.ts | slice10-line-diff | dev (Vision) | sent back 2026-11-08 (Vision gate 971, candidate 7f02cde): normalised anchor key at lineDiff.ts:93 and in-run work guard at lineDiff.ts:214 untested; wordDiff.test.ts not authorised. Fix brief slice-10-line-diff-anchors-fix.md continues feature/slice10-line-diff-anchors |
| slice9-sync-scroll-mapping | 9 | src/renderer/features/sync-scroll/mapping.ts, test/unit/syncScrollMapping.test.ts | main | dev (Vision) | queued (brief slice-9-sync-scroll-mapping.md; reserve while 964 and 957 run) |
| slice8-table-formatter | 8 | src/shared/format/tableFormat.ts, test/unit/tableFormat.test.ts | main | dev (Vision) | queued (brief slice-8-table-formatter.md; reserve, owns new files only; AC-R13-07 stays planned) |
| windows-argv-open-flake | — (bug) | test/e2e/helpers.ts, test/e2e/preview.spec.ts, test/e2e/editor.spec.ts | main | dev (Vision) | sent back 2026-11-08 (Vision gate 977, candidate 8408d1e): a failed title wait or a throwing page callback leaks the Electron app; preview.spec.ts and the onPage callback were outside the brief. Fix brief windows-argv-open-flake-fix.md continues feature/windows-argv-open-flake. Disputed: the 10,000 ms bound is within the 15,000 ms test timeout, and AC-PERF-03 passed on Windows CI. Overlaps macos-e2e on test/e2e/helpers.ts (chord constants only) |

## Notes
- Slice 5's brief owns broad globs. Before the next slice-5 run, narrow it
  to the files it creates plus one wiring part, so module parts can run
  in parallel.
- New module parts own new files only. Wiring into shared files (main
  entry, preload, command registry, menu, renderer main) is a separate
  dev item.
- Slice 6 part 1 owns new files only and is disjoint from slice 5's
  branch. Slice 5's broad globs must be narrowed before a further src
  part is queued from main.
