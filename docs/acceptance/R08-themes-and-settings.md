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
