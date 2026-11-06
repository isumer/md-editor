# Work graph

One row per work item. Two queued or running items never own the same file.
Depends-on names merged items where possible. Lanes: dev, side, nim.
Update a row when an item is queued, merged or sent back.

| id | slice | owned files | depends on | lane | status |
| --- | --- | --- | --- | --- | --- |
| 039 → fix-2 | 4 | src/renderer/features/preview/**, src/renderer/workers/render/**, src/renderer/main.ts, src/renderer/styles.css, src/shared/workers/render.ts, preview test files (see brief slice-4-fix-2.md), test/e2e/preview*.spec.ts | main; branch auto/039-slice-4-fix-review | dev (Vision) | merged (cc087b6) |
| 041 | 5 | listed files only (brief slice-5-fix-3.md; no broad globs) | slice 4 (stacked) | dev | sent back (087, 869, 881: coverage red); fix-3 queued |
| slice6-tree-model | 6 | src/shared/workspace/treeRows.ts, test/unit/workspaceTreeRows.test.ts | main | dev | candidate 632759b (CI pending) |
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
| slice7-language-module | 7 | src/shared/text/language.ts, test/unit/language.test.ts | main | nim | review queued (868) |
| languages-fixture-readme | 7 | test/fixtures/languages/README.md | main | side | review queued (867) |
| slice7-line-endings | 7 | src/shared/text/lineEndings.ts, test/unit/lineEndings.test.ts | main | nim | queued (874) |
| slice7-find-replace | 7 | src/shared/text/findReplace.ts, test/unit/findReplace.test.ts | main | side | queued (873) |
| slice6-tree-generator | 6 | test/fixtures/workspace/generate-tree.mjs, test/fixtures/workspace/README.md | main | dev | done (870); verify red on Pi perf only; review pending |
| slice7-binary-open | 7 | src/io-worker/services/file.ts, src/shared/ipc/result.ts, src/shared/messages/en.ts, test/unit/ioWorker.test.ts, test/e2e/binary-open.spec.ts | main (binary.ts merged) | dev (Vision) | queued (882) |
| slice12-settings-module | 12 | src/shared/settings/settings.ts, test/unit/settings.test.ts | main | side (Edith) | queued (883) |
| slice8-outline-module | 8 | src/shared/outline/outline.ts, test/unit/outline.test.ts | main | nim (Karen) | queued (884) |
| slice6-workspace-paths | 6 | src/shared/workspace/workspacePath.ts, test/unit/workspacePath.test.ts | main | dev (Vision) | queued |
| io-port-restart | 5 (bug) | src/main/io/ioWorker.ts, src/main/main.ts, src/preload/preload.ts, src/shared/ipc/io.ts, test/unit/{ioSupervisor,preload,ioContracts}.test.ts | 041 merged (same files) | dev | planned: queue when 041 is on main (brief io-port-restart.md) |

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
