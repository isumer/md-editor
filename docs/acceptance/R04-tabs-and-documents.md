# R4 — Several files open in tabs, and crash safety

### AC-R4-01 — Each tab keeps its own text, undo history, cursor and scroll
status: implemented
Given two files are open in two tabs
When the user edits one, moves its cursor, scrolls it, then switches to the other and back
Then each tab still shows its own text, undo history, cursor position and scroll position

### AC-R4-02 — Opening an already-open path focuses its existing tab
status: implemented
Given a file is open in a tab
When the user opens the same path again (menu, command line, or a second launch)
Then no duplicate tab appears and the existing tab is focused

### AC-R4-03 — A dirty marker per tab tracks its own document
status: implemented
Given two tabs, one with unsaved changes and one clean
When the tabs are shown
Then only the dirty tab is marked dirty, the marker clears when that tab is saved, and undoing back to the saved text clears it

### AC-R4-04 — Closing a clean tab closes it without a prompt
status: implemented
Given a tab whose document has no unsaved changes
When the user closes the tab
Then it closes immediately and no prompt appears

### AC-R4-05 — Closing a dirty tab asks; each answer does what it says
status: implemented
Given a tab with unsaved changes
When the user closes the tab and a prompt appears
Then Cancel keeps the tab open, Discard closes it and loses the changes, and Save writes the file then closes it

### AC-R4-06 — Quitting with unsaved changes asks before discarding
status: implemented
Given at least one open tab has unsaved changes
When the app is asked to quit
Then a prompt names the unsaved documents; Cancel keeps the app open, Discard quits without writing any file (saved files keep their unsaved text in the session, AC-R4-08; untitled documents lose it), and Save writes each unsaved document before quitting

### AC-R4-07 — A renderer crash loses at most a few seconds of typing, which is recovered
status: implemented
Given a document with recent edits has been idle long enough to draft
When the renderer process is killed and the app recovers
Then the document text up to the last draft (at most a few seconds old) is restored

### AC-R4-08 — Reopening the app restores the previous session's open documents
status: implemented
Given a session with two files open and unsaved changes
When the app is closed and opened again
Then both documents reopen with their text and unsaved changes intact

### AC-R4-09 — Dropping a file onto the window opens it in a tab
status: implemented
Given the app is running
When a file is dragged and dropped onto the window
Then the file opens in a new tab

## Side-by-side views (the second view)

### AC-R4-10 — A tab moves or is cloned to the other view
status: planned
Given one view with two tabs
When the user picks Move to Other View on one tab and Clone to Other View on the other
Then a second view opens holding the moved tab and a clone, and the first view keeps only the cloned tab

### AC-R4-11 — An edit in a clone appears in the other view in the same frame
status: planned
Given a document cloned into both views
When the user types in one view
Then the other view shows the change in the same animation frame, keeps its own cursor and scroll, and both tabs share one dirty state

### AC-R4-12 — A clone shares one undo history
status: planned
Given an edit made in view 1 of a cloned document
When the user presses Undo in view 2
Then the edit is undone once in both views, and Redo in view 1 restores it

### AC-R4-13 — The second view closes with its last tab
status: planned
Given two views where view 2 has one tab
When that tab is closed or dragged to view 1
Then view 2 closes and view 1 takes the full width

### AC-R4-14 — Views rotate and the divider persists
status: planned
Given two side-by-side views
When the user picks View > Rotate and drags the divider to 30 %
Then the views are stacked at 30 / 70, and orientation and position survive a restart

### AC-R4-15 — Synchronised scrolling keeps the starting line offset
status: planned
Given two views whose top lines are 1 and 41, and vertical synchronisation is turned on
When view 1 is scrolled to line 101
Then view 2's top line is 141; horizontal synchronisation keeps its column offset the same way

### AC-R4-16 — F8 moves focus between views
status: planned
Given two views with focus in view 1
When the user presses F8
Then focus is in view 2's editor, and a tab command such as Close acts on view 2

### AC-R4-17 — A cloned Markdown tab can show its preview in the other view without a second parse
status: planned
Given a Markdown tab cloned into view 2 and view 2 set to preview only
When the user edits in view 1
Then view 2's preview updates, and the render worker parsed the change once

### AC-R4-18 — Dragging a tab to the right edge opens the second view
status: planned
Given one view with two tabs
When the user drags one tab over the right half of the editor area, sees the drop highlight there, and releases it
Then a second view opens on the right holding that tab, the first view keeps the other tab, and dropping back on the tab bar of view 1 moves it back (AC-R4-13 then closes view 2)
