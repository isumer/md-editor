# PERF — Response time

### AC-PERF-01 — No white flash at startup
status: implemented
Given the app is launched
When the window first becomes visible
Then it is shown only after the first paint (`ready-to-show`), within 2 s of launch

### AC-PERF-02 — Keystroke to preview, typical document
status: planned
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
status: planned
Given the renderer posts a burst of menu state changes
When main applies them
Then at most one update reaches the menu per 100 ms and each update costs under 2 ms in main

### AC-PERF-07 — Keystroke to preview, 500 KB document
status: planned
Given a 500 KB Markdown document is open
When the user types (30+ samples after warm-up)
Then the preview reflects each keystroke with p95 < 150 ms

### AC-PERF-08 — Preview DOM patch per keystroke
status: planned
Given a document is open and previewed
When the user types one character
Then the preview patch touches only the changed blocks and takes p95 < 8 ms on the UI thread

### AC-PERF-09 — Scrolling the preview keeps every frame within budget
status: planned
Given a 500 KB (and a 20 MB) Markdown document is previewed
When the user flings the preview scroll
Then no frame exceeds 32 ms and no long task is recorded

### AC-PERF-10 — Keystroke to preview, 20 MB document
status: planned
Given a 20 MB Markdown document is open
When the user types (30+ samples after warm-up)
Then the preview reflects each keystroke with p95 < 100 ms (incremental parse)

### AC-PERF-11 — Opening a 20 MB document is editable and shows a first preview quickly
status: planned
Given a 20 MB Markdown file is opened
When the file loads
Then the editor is editable within 1.5 s and the first preview screen renders within 1 s
