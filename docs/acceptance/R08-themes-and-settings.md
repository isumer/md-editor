# R08 — Light, dark and system themes, with saved settings

### AC-R08-01 — Settings load with defaults, migrate and save the same shape
status: implemented
Given a settings document
When the editor loads it
Then a missing, empty, invalid or wrong-shaped document gives the documented defaults, a version-0 document migrates by renaming `editor.tabWidth` to `editor.tabSize` and keeping its value, unknown keys survive a load-then-save round trip, and saving writes the same shape back

### AC-R08-02 — A corrupt settings file loads the defaults
status: planned
Given a settings file whose JSON is truncated or is not an object
When the editor starts
Then it loads the defaults, does not throw, and leaves the corrupt file unreadable as settings until the user saves new ones

### AC-R08-03 — Light, dark and follow-system themes
status: planned
Given the theme setting is light, then dark, then system
When the app is shown, and in system mode the OS switches between light and dark
Then editor, preview and chrome use the light or dark theme accordingly, and in system mode they follow the OS change without a restart

### AC-R08-04 — Settings survive a restart
status: planned
Given the user changes theme, both background colours, font size, view mode and sync scroll
When the app is quit and started again
Then every changed value is in effect and `settings.json` was written atomically

### AC-R08-05 — Font size changes apply to the editor at once
status: planned
Given a document is open
When the user increases and decreases the editor font size
Then the editor text size changes immediately, the cursor stays on the same line, and the value is saved

### AC-R08-06 — The preview uses the GitHub-style stylesheet with code highlighting in both themes
status: planned
Given a document with headings, a table, a blockquote and fenced code in two languages
When it is previewed in light and in dark theme
Then the preview uses the GitHub-style rules for each element and the code carries highlight colours readable on that theme's background
