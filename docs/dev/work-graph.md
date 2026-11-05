# Work graph

One row per work item. Two queued or running items never own the same file.
Depends-on names merged items where possible. Lanes: dev, side, nim.
Update a row when an item is queued, merged or sent back.

| id | slice | owned files | depends on | lane | status |
| --- | --- | --- | --- | --- | --- |
| 039 → fix-2 | 4 | src/renderer/features/preview/**, src/renderer/workers/render/**, src/renderer/main.ts, src/renderer/styles.css, src/shared/workers/render.ts, preview test files (see brief slice-4-fix-2.md), test/e2e/preview*.spec.ts | main; branch auto/039-slice-4-fix-review | dev (codex) | review in progress (0861) |
| 041 | 5 | src/renderer/**, src/main/**, src/shared/**, src/preload/**, test/unit/**, test/e2e/** (brief slice-5.md) | slice 4 (stacked) | dev | sent back (087); fix queued (slice-5-fix) |
| slice6-tree-model | 6 | src/shared/workspace/treeRows.ts, test/unit/workspaceTreeRows.test.ts | main | dev | queued |
| 040 | 8 | test/fixtures/powertools/** | main | side | merged (feb37f0) |
| outline-fixtures | 8 | test/fixtures/outline/** | main | side | merged (de72ccb) |
| 042 | 13 | export fixtures under test/fixtures/export/** | main | nim | merged (70d4ea9) |
| 054 | 6 | test/fixtures/workspace/** | main | side | merged (b6c2dac) |
| 055 | 14 | test/fixtures/stability/** | main | nim | candidate merge/055 (review queued, 074) |
| bin-detect | 7 | src/shared/text/binary.ts, test/unit/binaryDetection.test.ts | main | side | merged (1c7481b) |
| log-fixture | 7 | test/fixtures/log/** | main | side | merged (47a2609) |
| md-boundaries | 4 | test/fixtures/markdown-boundaries/** | main | side | candidate 092003d (review not queued) |
| find-replace-fx | 7 | test/fixtures/find-replace/** | main | nim | candidate auto/nim/069 (in review, 073) |
| compare-gen | 10 | test/fixtures/compare/generate-folders.mjs, test/fixtures/compare/README.md | main | side | merged (ce1e212) |
| replace-in-files-fx | 8 | test/fixtures/replace-in-files/** | main | nim | queued (076) |
| git-roundtrip-fx | 11 | test/fixtures/merge/git-roundtrip.mjs, test/fixtures/merge/README.md | main | side | merged (82c7b0a) |
| conflict-style-fx | 11 | test/fixtures/merge/conflict-styles/** | main | side | merged (0724cc9) |
| gate-fixture-readmes | — | test/fixtures/depcruise/README.md, test/fixtures/fuses/README.md, test/fixtures/licenses/README.md | main | side | queued |

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
