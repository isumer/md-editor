# R6 — Export the preview

### AC-R6-01 — HTML export is one self-contained file
status: planned
Given a Markdown document with a heading, a fenced code block and a relative image
When it is exported to HTML
Then one file is written atomically that contains the rendered heading, the highlighted code, inlined CSS and no external stylesheet, and the image keeps its relative path

### AC-R6-02 — HTML export uses the current preview theme, or light on request
status: planned
Given the dark theme is active
When the document is exported with and without the "always light" option
Then the exported CSS is the dark preview style, then the light one

### AC-R6-03 — PDF export writes a valid multi-page PDF
status: planned
Given a document long enough for several pages
When it is exported to PDF
Then the file starts with `%PDF-`, has more than one page, and is written atomically

### AC-R6-04 — PDF options apply
status: planned
Given the PDF options A4 or Letter, margins and background colour on or off
When the document is exported with each option
Then the PDF page size matches the choice and the background is printed only when on

### AC-R6-05 — Export leaves the editor responsive
status: planned
Given a 500 KB document
When it is exported to PDF
Then the editor accepts keystrokes within the keystroke budget while the export runs
