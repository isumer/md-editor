# R14 — Compare files and folders

## File compare

### AC-R14-01 — Two files open in a side-by-side compare
status: planned
Given two text files that differ in added, deleted and modified lines
When the user compares them (tab menu Compare with…, two sidebar selections, or `--diff a b`)
Then both are shown side by side, aligned, with each changed line marked added, deleted or modified

### AC-R14-02 — Modified lines highlight the changed words
status: implemented
Given a modified line where one word changed
When the compare is shown with Highlight: words
Then only that word is highlighted inside the line; Highlight: characters, lines and none behave likewise on fixtures

### AC-R14-03 — The unified mode shows the same changes
status: planned
Given a side-by-side compare
When the user toggles unified mode
Then the same changes are shown in one column with the same change count

### AC-R14-04 — Compare with Clipboard and Compare with Saved
status: planned
Given a dirty tab and text on the clipboard
When the user picks Compare with Saved, then Compare with Clipboard
Then the buffer is compared with the file on disk, then with the clipboard text, which is a read-only side

### AC-R14-05 — A chunk arrow applies or reverts one change and undoes in one step
status: planned
Given a compare with three changes
When the user clicks the arrow of the second change
Then the target side takes that chunk, the change count drops by one, the operation takes under 50 ms, and one Undo restores it

### AC-R14-06 — Both sides are editable and re-diff as you type
status: planned
Given a compare
When the user edits either side
Then the diff updates without a full re-diff of unchanged regions, and each side saves atomically with its own encoding and line endings

### AC-R14-07 — Next and previous difference
status: implemented
Given a compare with changes and focus on the first
When the user presses F7 three times and Shift+F7 once
Then the selection moves to the next change each time and back once, and the gutter overview marks every change

### AC-R14-08 — Ignore options change what counts as a difference
status: implemented
Given files differing only in trailing whitespace, in case and in line endings
When the matching ignore option is on
Then those lines are not reported as changes, and with it off they are

### AC-R14-09 — Unchanged regions collapse
status: planned
Given two 1,000-line files with one change at line 500
When the compare is shown
Then the unchanged regions are collapsed with an expand control, and expanding shows the lines aligned

### AC-R14-10 — Two 20 MB files show their first diff quickly and the window stays responsive
status: planned
Given two 20 MB files with 1 % of lines changed
When they are compared
Then the first diff is shown within 2 s and no long task over 50 ms blocks the window while the diff runs

### AC-R14-11 — A diff that runs too long falls back and says so
status: planned
Given a pair whose word-level diff exceeds the time limit
When it is compared
Then a coarser line diff is shown with a notice, and the window never freezes

## Folder compare

### AC-R14-12 — Every entry of two folders is classified correctly
status: implemented
Given two generated folder trees with a precomputed answer
When they are compared by contents
Then each entry is marked same, changed, only left, only right, binary differs or error exactly as the answer says

### AC-R14-13 — Folder compare streams, and cancels quickly
status: planned
Given two 10,000-file trees
When they are compared
Then the first results appear within 300 ms, the window stays responsive, and Cancel stops the work within 200 ms

### AC-R14-14 — Size-and-timestamp mode skips hashing
status: implemented
Given two trees whose files differ in content but match in size and timestamp
When they are compared in size + timestamp mode
Then those files are marked same and no file content is read

### AC-R14-15 — Filters and exclusions
status: implemented
Given trees containing `.git`, `node_modules` and differing files
When the folder compare is shown with "only differences" and a name pattern
Then excluded folders never appear, and only matching differing entries are listed

### AC-R14-16 — Copy and delete actions are confirmed and atomic
status: planned
Given an entry that exists only on the left
When the user copies it to the right and deletes another entry, confirming each
Then the copy is written atomically, the deleted file goes to the trash, and an open document at the target path changes as one undoable transaction

### AC-R14-17 — Double-clicking a changed file opens its file compare
status: planned
Given a folder compare with a changed file
When the user double-clicks it
Then a file compare of the two versions opens in a tab

### AC-R14-18 — Watched changes re-compare the entry
status: planned
Given a folder compare is open
When a compared file is changed on disk
Then its entry is re-classified without a full re-compare
