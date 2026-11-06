# PERF — Response time

### AC-PERF-01 — No white flash at startup
status: implemented
Given the app is launched
When the window first becomes visible
Then it is shown only after the first paint (`ready-to-show`), within 2 s of launch

### AC-PERF-02 — Keystroke to preview, typical document
status: implemented
Given a 50 KB Markdown document is open
When the user types (30+ samples after warm-up)
Then the preview reflects each keystroke with p95 < 50 ms

### AC-PERF-03 — A file named on the command line is editable soon after launch
status: implemented
Given the app is launched with a Markdown file argument
When the window appears
Then the file's text is in the editor and accepts typing within 2 s of launch

### AC-PERF-04 — Typing sends only the change to the file process
status: implemented
Given a 20 MB document is open
When the user types one character
Then the message sent to the file process for that edit is the change (under 1 KB), not a copy of the document

### AC-PERF-05 — Typing copies no whole document on the editor's thread
status: implemented
Given a 20 MB document is open
When the user types one character
Then the editor's thread builds no whole-document string for that edit, and the message sent to the render process is the change (under 1 KB)

### AC-PERF-06 — Menu state pushes are coalesced and cheap in main
status: implemented
Given the renderer posts a burst of menu state changes
When main applies them
Then at most one update reaches the menu per 100 ms and each update costs under 2 ms in main

### AC-PERF-07 — Keystroke to preview, 500 KB document
status: implemented
Given a 500 KB Markdown document is open
When the user types (30+ samples after warm-up)
Then the preview reflects each keystroke with p95 < 150 ms

### AC-PERF-08 — Preview DOM patch per keystroke
status: implemented
Given a document is open and previewed
When the user types one character
Then the preview patch touches only the changed blocks and takes p95 < 8 ms on the UI thread

### AC-PERF-09 — Scrolling the preview keeps every frame within budget
status: implemented
platforms: linux, win32
Given a 500 KB (and a 20 MB) Markdown document is previewed
When the user flings the preview scroll
Then no frame exceeds 32 ms and no long task is recorded

macOS is skipped until a real-Mac measurement exists (owner decision, PR #9): the
GitHub macOS VM's virtual GPU stalls presentation and raster for 40–180 ms while
the renderer is idle, so its frame times do not show what a Mac does.

### AC-PERF-10 — Keystroke to preview, 20 MB document
status: implemented
Given a 20 MB Markdown document is open
When the user types (30+ samples after warm-up)
Then the preview reflects each keystroke with p95 < 100 ms (incremental parse)

### AC-PERF-11 — Opening a 20 MB document is editable and shows a first preview quickly
status: implemented
Given a 20 MB Markdown file is opened
When the file loads
Then the editor is editable within 1.5 s and the first preview screen renders within 1 s

## Platform rule — 20 MB performance criteria

The user decided this on 2026-11-05 (option c). The 20 MB rows of
AC-PERF-09, AC-PERF-10 and AC-PERF-11 are enforced on desktop-class CI
runners only: GitHub ubuntu, windows and macOS. The Raspberry Pi precheck
runs them as information: report the numbers and do not block a merge on
them. The 32 ms, 100 ms and 1 s budgets are not widened. If CI records a
frame or a keystroke over budget, that is a product defect.

