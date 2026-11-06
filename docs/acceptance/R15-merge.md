# R15 — Three-way merge view

### AC-R15-01 — The fixture set merges to the expected result
status: planned
Given each (base, left, right, expected) fixture: clean merges, adjacent edits, the same edit on both sides, real conflicts, insert at end, deleted versus modified
When it is merged automatically
Then the result equals `expected` and the reported conflict count matches the fixture

### AC-R15-02 — The same edit on both sides is not a conflict
status: planned
Given left and right make the identical change to the same base lines
When they are merged
Then the change is applied once and no conflict is reported

### AC-R15-03 — Three panes with an editable centre
status: planned
Given a base and two sides
When the merge view opens
Then left and right are read-only, the centre starts from the base (or from left when there is no base) and is editable

### AC-R15-04 — Chunk arrows accept left, right or both
status: planned
Given a conflict chunk
When the user accepts left, then undoes and accepts both (left then right)
Then the centre holds the left text, then the left text followed by the right text, and the counter updates

### AC-R15-05 — Apply all non-conflicting changes in one step
status: planned
Given a merge with five non-conflicting changes and two conflicts
When the user applies all non-conflicting changes
Then the five are in the centre, "2 conflicts left" is shown, and one Undo removes all five

### AC-R15-06 — A file with conflict markers opens as a merge
status: planned
Given a file containing `<<<<<<<`, `=======` and `>>>>>>>` blocks
When it is opened as a merge
Then the sides are split from the markers and each block is a conflict

### AC-R15-07 — Apply with unresolved conflicts needs confirmation
status: planned
Given one unresolved conflict
When the user presses Apply
Then the result is not written until the user confirms, and is then saved atomically

### AC-R15-08 — git mergetool round trip
status: planned
Given a scripted git repo with a conflicting merge and `merge.tool` set to the app
When `--merge LOCAL REMOTE BASE MERGED` is resolved and applied, and in a second run aborted
Then MERGED holds the resolved text and the exit code is 0, and after Abort MERGED is unchanged and the exit code is 1

### AC-R15-09 — git difftool opens a file compare
status: planned
Given `diff.tool` set to the app
When `git difftool` runs on a changed file
Then the app opens a file compare of the two versions

### AC-R15-10 — Navigation and counters
status: planned
Given a merge with changes and conflicts
When the user presses F7 and Shift+F7
Then the selection moves between changes and conflicts, and the counter states the changes and conflicts left

### AC-R15-11 — A large merge stays responsive
status: planned
Given two 5 MB files with 200 conflicts against a base
When the merge view opens and a conflict is accepted
Then no long task over 50 ms blocks the window, and accepting a chunk takes under 50 ms
