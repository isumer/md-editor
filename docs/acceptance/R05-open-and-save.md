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
Given the opened path is a symlink to another file
When the user saves
Then the link still exists and the target file holds the new text

### AC-R5-06 — Save keeps the file's permissions
status: implemented
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
