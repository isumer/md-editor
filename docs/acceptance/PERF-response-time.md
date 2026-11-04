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
