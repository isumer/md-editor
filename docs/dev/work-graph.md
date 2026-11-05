# Work graph

One row per work item. Two queued or running items never own the same file.
Depends-on names merged items where possible. Lanes: dev, side, nim.
Update a row when an item is queued, merged or sent back.

| id | slice | owned files | depends on | lane | status |
| --- | --- | --- | --- | --- | --- |
| 039 → fix-2 | 4 | src/renderer/features/preview/**, src/renderer/workers/render/**, src/renderer/main.ts, src/renderer/styles.css, src/shared/workers/render.ts, preview test files (see brief slice-4-fix-2.md), test/e2e/preview*.spec.ts | main; branch auto/039-slice-4-fix-review | dev (codex) | queued (sent back 2026-11-05) |
| 041 | 5 | src/renderer/**, src/main/**, src/shared/**, src/preload/**, test/unit/**, test/e2e/** (brief slice-5.md) | slice 4 (stacked; re-queued after fix-2) | dev | waiting for slice 4 |
| 040 | 8 | test/fixtures/powertools/** | main | side | reviewed (candidate 0b6aecc dropped earlier; re-merged) |
| outline-fixtures | 8 | test/fixtures/outline/** | main | side | queued |
| 042 | 13 | export fixtures under test/fixtures/ (see branch auto/nim/042-…) | main | nim | review queued (053) |
| 054 | 6 | test/fixtures/workspace/** | main | side | review queued (062, candidate redo) |
| 055 | 14 | test/fixtures/stability/** | main | nim | reviewing (066) |
| bin-detect | 7 | src/shared/text/binary.ts, test/unit/binaryDetection.test.ts | main | side | candidate merge/slice-7-binary-detection (review passed) |
| log-fixture | 7 | test/fixtures/log/** | main | side | review queued (067) |
| md-boundaries | 4 | test/fixtures/markdown-boundaries/** | main | side | queued |
| find-replace-fx | 7 | test/fixtures/find-replace/** | main | nim | queued |

## Notes
- Slice 5's brief owns broad globs. Before the next slice-5 run, narrow it
  to the files it creates plus one wiring part, so module parts can run
  in parallel.
- New module parts own new files only. Wiring into shared files (main
  entry, preload, command registry, menu, renderer main) is a separate
  dev item.
- No src module part can be queued while slice 5 owns all of src/**.
  Side and NIM take fixtures and test data until it merges.
