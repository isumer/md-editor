# R2 — Either pane on its own, full screen

### AC-R2-01 — The view mode switches between split, editor only and preview only
status: implemented
Given a Markdown document is open in split mode
When the user picks editor only, then preview only, then split from the View menu
Then only the editor, then only the preview, then both are shown, and the text, cursor and scroll of the tab are unchanged

### AC-R2-02 — The divider drags and resets
status: implemented
Given split mode
When the user drags the divider to 30 % and then double-clicks it
Then the editor takes 30 % of the width, then 50 % again, and the last position survives a restart

### AC-R2-03 — Full screen uses the operating system's full screen
status: implemented
Given the window is not full screen
When the user invokes View > Full Screen (F11 on Windows and Linux, Ctrl+Cmd+F on macOS) and invokes it again
Then the window enters and then leaves the OS full screen state

### AC-R2-04 — Focus mode hides everything but the active panes
status: implemented
Given split, editor-only or preview-only mode
When the user presses CmdOrCtrl+Shift+F and then Esc
Then the window is full screen with tab bar, sidebar and status bar hidden, and Esc restores the previous layout and view mode

### AC-R2-05 — Resizing the window never stalls and never jumps
status: implemented
Given a 500 KB document in split mode with the preview scrolled to the middle
When the window is resized continuously for 2 s
Then no frame takes over 32 ms, no long task occurs, and the top visible preview block is the same before and after

### AC-R2-06 — Entering and leaving full screen or focus mode is quick
status: implemented
Given a 500 KB document is open
When full screen or focus mode is entered or left
Then the editor accepts a keystroke within 100 ms after the OS animation ends

### AC-R2-07 — A wide window adds margin, not reflow
status: implemented
Given the preview max width is 900 px
When the window is widened beyond it
Then the preview text column stays 900 px wide

### AC-R2-08 — View modes take no screen row of their own
status: planned
Given the main window with default settings
When it is shown
Then there is no toolbar row for view modes; the mode is chosen from the View menu or its shortcut, and the editor area starts directly under the tab bar
