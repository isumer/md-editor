# R5 — Open and save

### AC-R5-01 — A file given on the command line opens at startup
status: implemented
Given the app is launched with a path to an existing Markdown file
When the window is shown
Then the editor holds the file's text and the preview renders it within 2 s

### AC-R5-02 — Save writes the text and clears the dirty marker
status: implemented
Given an opened file with unsaved edits (title shows "•")
When the user chooses File > Save
Then the file on disk contains the edited text and the title no longer shows "•"

### AC-R5-03 — A failed save leaves the original file intact
status: implemented
Given a file with known content
When writing the new content fails part-way
Then the file still has its old content and no temporary file is left beside it

### AC-R5-04 — Overlapping saves of one file end with the newest text
status: implemented
Given two saves of the same file are in flight and the first is slower
When both complete
Then the file holds the second save's text

### AC-R5-05 — Saving through a symlink updates the target
status: implemented
platforms: linux, darwin
Given the opened path is a symlink to another file
When the user saves
Then the link still exists and the target file holds the new text

### AC-R5-06 — Save keeps the file's permissions
status: implemented
platforms: linux, darwin
Given an existing file with a non-default mode (POSIX)
When the user saves
Then the file has the same mode afterwards

### AC-R5-07 — Transient Windows file locks do not fail a save
status: implemented
Given on Windows the rename fails with EPERM, EACCES or EBUSY
When the failure clears within the retry window (5 retries, 50→800 ms)
Then the save succeeds; if it never clears, the save fails with the last error and leaves no temp file

### AC-R5-08 — File menu commands have stable ids and standard shortcuts
status: implemented
Given the app is running
When the File menu is inspected
Then Open, Save and Save As exist with ids `file-open`, `file-save`, `file-save-as` and accelerators CmdOrCtrl+O, CmdOrCtrl+S, CmdOrCtrl+Shift+S

### AC-R5-09 — Opening a file never silently discards unsaved changes
status: implemented
Given the current document has unsaved changes
When another file is opened (menu, second launch, open-file)
Then the user is asked before the changes are discarded, and cancelling keeps them

### AC-R5-10 — Save As writes to the chosen path and adopts it
status: implemented
Given an open document
When the user chooses File > Save As and picks a new path
Then the new file holds the text, the original file is unchanged, and later saves go to the new path

### AC-R5-11 — Saving an untitled document asks for a path
status: implemented
Given a new, never-saved document with text
When the user chooses File > Save
Then a save dialog is shown, and the file is written to the chosen path

### AC-R5-12 — A cancelled dialog changes nothing
status: implemented
Given an open, dirty document
When the user cancels an Open or Save As dialog
Then the document, its path, its dirty marker and the files on disk are unchanged

### AC-R5-13 — A file that cannot be read leaves the current document intact
status: implemented
Given an open document
When opening another file fails (missing, no permission, not decodable)
Then the status bar names the failure and the current document is unchanged

### AC-R5-14 — An edit made while a save is in flight stays unsaved
status: implemented
Given a save has started
When the user types before it completes
Then after it completes the document is still marked dirty and the file holds the text as of the save request

### AC-R5-15 — File menu items run their commands
status: implemented
Given the app is running
When File > Open, Save or Save As is activated from the menu
Then the corresponding action runs (dialog shown or file written), not only the item existing

### AC-R5-16 — Failures are explained in words that name the file
status: implemented
Given an open or save fails (missing, is a folder, no permission, disk full, changed on disk)
When the status bar reports it
Then the message names the file and the reason in plain words, and does not show a raw system code alone

### AC-R5-17 — Saving keeps working after the file process crashes
status: implemented
Given a document is open and edited
When the process that reads and writes files dies and the user then saves
Then the save writes the same file without asking for a path again, and a save that was in flight at the crash reports a retryable failure and leaves the document marked unsaved

### AC-R5-18 — Save writes the version the user saved without resending the document
status: implemented
Given a document is open and edited
When the user saves
Then the save request names a document version and carries no text, the file holds the text exactly as of that version, and edits typed while the save is in flight are not written and keep the document marked unsaved

### AC-R5-19 — The file process's copy of a document never saves the wrong text
status: implemented
Given a document is edited, replaced by another, or the file process restarts, in any interleaving
When the user saves
Then the file holds the editor's text at the saved version, or (if the file process's copy was lost or behind) the editor resends the document once and the save then succeeds; changes from an earlier load of the document are ignored
