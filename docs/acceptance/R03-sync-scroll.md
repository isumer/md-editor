# R3 — Editor and preview scroll together

### AC-R3-01 — Scrolling the editor brings the same block to the top of the preview
status: implemented
Given a document with 50 headings and sync scroll on
When the editor is scrolled so that a heading is the top visible line
Then the preview's top visible block is that heading, within ±1 block

### AC-R3-02 — Scrolling the preview brings the same line to the top of the editor
status: implemented
Given the same document with sync scroll on
When the preview is scrolled so that a heading is the top visible block
Then the editor's top visible line is that heading's source line, within ±1 block

### AC-R3-03 — The two panes never feed back into each other
status: planned
Given sync scroll is on
When the editor is scrolled once and left alone
Then the preview scrolls once, the editor receives no scroll it did not start, and both positions are still after 1 s

### AC-R3-04 — Sync scroll is a toggle
status: implemented
Given sync scroll is on
When the user turns it off in the View menu and scrolls the editor
Then the preview does not move, and the setting survives a restart

### AC-R3-05 — Sync scroll of a 20 MB document keeps the scroll frame budget
status: planned
Given a 20 MB document with sync scroll on
When the editor is fling-scrolled
Then no frame in either pane takes over 32 ms
