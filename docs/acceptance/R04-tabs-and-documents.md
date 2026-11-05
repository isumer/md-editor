# R4 — Several files open in tabs, and crash safety

### AC-R4-01 — Each tab keeps its own text, undo history, cursor and scroll
status: planned
Given two files are open in two tabs
When the user edits one, moves its cursor, scrolls it, then switches to the other and back
Then each tab still shows its own text, undo history, cursor position and scroll position

### AC-R4-02 — Opening an already-open path focuses its existing tab
status: planned
Given a file is open in a tab
When the user opens the same path again (menu, command line, or a second launch)
Then no duplicate tab appears and the existing tab is focused

### AC-R4-03 — A dirty marker per tab tracks its own document
status: planned
Given two tabs, one with unsaved changes and one clean
When the tabs are shown
Then only the dirty tab is marked dirty, the marker clears when that tab is saved, and undoing back to the saved text clears it

### AC-R4-04 — Closing a clean tab closes it without a prompt
status: planned
Given a tab whose document has no unsaved changes
When the user closes the tab
Then it closes immediately and no prompt appears

### AC-R4-05 — Closing a dirty tab asks; each answer does what it says
status: planned
Given a tab with unsaved changes
When the user closes the tab and a prompt appears
Then Cancel keeps the tab open, Discard closes it and loses the changes, and Save writes the file then closes it

### AC-R4-06 — Quitting with unsaved changes asks before discarding
status: planned
Given at least one open tab has unsaved changes
When the app is asked to quit
Then a prompt names the unsaved documents; Cancel keeps the app open, Discard quits losing the changes, and Save writes each unsaved document before quitting

### AC-R4-07 — A renderer crash loses at most a few seconds of typing, which is recovered
status: planned
Given a document with recent edits has been idle long enough to draft
When the renderer process is killed and the app recovers
Then the document text up to the last draft (at most a few seconds old) is restored

### AC-R4-08 — Reopening the app restores the previous session's open documents
status: planned
Given a session with two files open and unsaved changes
When the app is closed and opened again
Then both documents reopen with their text and unsaved changes intact

### AC-R4-09 — Dropping a file onto the window opens it in a tab
status: planned
Given the app is running
When a file is dragged and dropped onto the window
Then the file opens in a new tab
