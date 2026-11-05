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
