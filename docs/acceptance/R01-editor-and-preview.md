# R1 — Editor and preview side by side

### AC-R1-01 — Editor and preview are shown side by side
status: implemented
Given the app is started
When the window is shown
Then an editable editor is on the left and the rendered preview on the right

### AC-R1-02 — Preview follows edits
status: implemented
Given a Markdown document is open
When the user types `## Added` on a new line
Then the preview shows a level-2 heading "Added" within 1 s

### AC-R1-03 — Fenced code is highlighted and task lists render
status: implemented
Given a document with a fenced code block in a known language and `- [x] done`
When it is rendered
Then the code carries highlight markup and the task item shows a checked, disabled checkbox

### AC-R1-04 — Block elements carry their source line
status: implemented
Given a document with headings and paragraphs
When it is rendered
Then every block element has `data-line` equal to its 0-based source line

### AC-R1-05 — Stale renders are never shown
status: implemented
Given several edits were made in quick succession
When an older render result arrives after a newer one was applied
Then the older result is discarded

### AC-R1-06 — A failed render keeps the last good preview
status: planned
Given the preview shows a rendered document
When a later render fails
Then the previous preview stays visible, an error is shown, and the next successful render replaces both

### AC-R1-07 — The preview shows the text of the version it names
status: implemented
Given a document is edited, replaced by another, or the render process restarts, in any interleaving
When the preview renders
Then the preview shows the document text exactly as of the version the result names, a result for an older document or version than one already shown is ignored, and a render process that lost or fell behind on its copy is given the document again before it renders

### AC-R1-08 — Undo and Redo are keyboard commands the keymap owns
status: implemented
Given an open document that has been edited
When the user presses CmdOrCtrl+Z and then CmdOrCtrl+Shift+Z (or CmdOrCtrl+Y)
Then the edit is undone and then redone, the preview follows both, and the title's dirty marker reflects the final state

### AC-R1-09 — Preview patching touches only the changed block
status: planned
Given a document with at least three paragraphs is previewed
When the user types in paragraph 3
Then every preview element for the other paragraphs is the same DOM node as before, and paragraph 3's element is updated

### AC-R1-10 — Editing a large document re-parses only the touched chunks
status: planned
Given a 20 MB Markdown document is open
When the user edits one paragraph
Then the render worker re-parses only the chunks containing the edit (counted, not timed: the parse count stays far below the whole document)

### AC-R1-11 — An image outside the edited region is not re-requested
status: planned
Given a document with an image in one block and text in another is previewed
When the user edits the text block
Then the image is not re-requested (its request count does not increase)
