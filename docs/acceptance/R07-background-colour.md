# R7 — User-chosen background colour

### AC-R7-01 — Editor and preview backgrounds are chosen separately
status: planned
Given the settings dialog
When the user picks one colour for the editor background and another for the preview background
Then each pane shows its colour at once, and both survive a restart

### AC-R7-02 — A chosen background overrides the theme until reset
status: planned
Given a custom preview background and the dark theme
When the user switches to the light theme, then picks "reset to theme default"
Then the custom colour stays across the theme switch, and after reset the pane uses the theme's background

### AC-R7-03 — An invalid stored colour falls back to the theme
status: implemented
Given `settings.json` holds a background value that is not a valid colour
When the app starts
Then the pane uses the theme's background and the app does not crash

### AC-R7-04 — Text stays readable on a chosen background
status: implemented
Given the user picks a background whose contrast with the theme's text is below 4.5:1
When it is applied
Then the text colour switches to the light or dark text colour that meets 4.5:1
