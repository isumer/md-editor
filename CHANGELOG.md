# Changelog

All notable changes to SolidMD will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Several files can be open at once, each in its own tab with its own text, undo history, cursor, scroll and preview. Opening a file that is already open focuses its tab. A dot marks each tab with unsaved changes. Dropping a file onto the window opens it in a tab.
- Closing a tab or quitting with unsaved changes asks first: Cancel, Discard or Save. Reopening the app restores the files you had open, with their unsaved changes.
- Unsaved typing is drafted every few seconds. If the window crashes, the app reopens it and restores the drafts. A stuck preview restarts on its own and the editor stays responsive.
- Opening a binary file now shows "it is a binary file" and keeps your current document. Files with a UTF-8 or UTF-16 byte order mark still open as text.
- Images next to a document now show in the preview: relative image paths load from the document's own folder (and its subfolders) and nowhere else; paths that try to escape the folder are refused.
- A set of ten sample documents (README, notes, raw HTML, CRLF, Turkish and CJK text, very long lines) whose preview output is checked against reviewed snapshots, so rendering changes show up as visible diffs.
- A reference table of the 36 languages code blocks are highlighted in, with a small sample file for each, as groundwork for opening source files.
- Export groundwork: the editor can build one self-contained HTML page from the rendered preview, and print HTML to PDF in a hidden window that runs no script and loads no local files. The file chooser and menu commands come later.
- A workspace sidebar: choose a folder with Open Folder and browse its subfolders and Markdown files. A folder loads its contents when you expand it, a filter narrows the list by name, and clicking a file opens it in a tab.

### Changed

- Renamed to SolidMD.
- No visible change: each feature (compare, merge, preview, workspace) now keeps its own files for its menu entries, messages and editor wiring, so features no longer share one big file. Menus, messages and shortcuts stay exactly as they were.
- Documents above 4 MiB now open without Markdown syntax highlighting, Markdown indentation on input and fold markers, so they open without a long freeze. Bracket matching still works.
- Typing in a large document now updates only the preview blocks you changed. Other blocks stay as they are.
- The preview keeps up with typing on 50 KB and 500 KB documents. The scroll stays smooth.
- Opening a 20 MB document shows the first screen quickly. The rest of the preview fills in without freezing the editor.
- A large preview update now lands in small batches instead of one long step, so the window stays responsive while a big document paints.
- Opening and scrolling a very large document no longer causes short freezes on slower computers. The preview fills in one step per screen frame.
- Keyboard shortcuts now come from one place in the editor: Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (Cmd on macOS) open, save, undo and redo, and also work with a non-Latin keyboard layout such as Russian. The File menu still shows these shortcuts. On Windows, AltGr letters (Ctrl+Alt) are always typed, never taken as shortcuts.
- The menu now has Edit (Cut, Copy, Paste, Select All), Window and Help menus; on macOS it has the standard application menu.
- The app now loads from its own private address instead of a local file, serves only its own files, and no longer lets the page load images from local file paths.

- Typing no longer builds a copy of the whole document for the preview: the preview worker keeps its own copy fed by the same small changes, and always renders exactly the version it names, asking for the document again if it fell behind.
- Saving no longer sends the whole document to the file process: it keeps its own copy, fed only the changes you type, and Save writes exactly the version you saved. If that copy is ever lost or behind, the editor resends the document once and the save still succeeds.

- Open and save failures now name the file and explain the reason in plain words, for example "Could not open “notes”: it is a folder."
- Files are now read and saved by a separate background process. If that process crashes, the app restarts it and Save keeps writing to the same file without asking for a path again. A save caught by the crash says so, and the document stays marked unsaved so you can try again.
- The automatic checks that run on every change now skip the speed measurements for a short while, while a speed problem on large documents is fixed. All other checks still run, and the speed measurements return with the fix.

### Fixed

- Opening a very large document no longer copies its whole text twice before the preview starts, so the first screen appears sooner.
- A message saying a save failed no longer disappears as soon as the preview updates after your next edit.
- If the background file service crashes and restarts, a save you make after the crash now waits for it and writes the file. Before, it could fail with "the file service restarted".
- When two tabs save under the same new file name at the same moment, the second save now refuses with a message instead of overwriting the first save's content.
- Opening a file, or restoring a draft, while another tab is still saving that same file now shows a message and does not open a second tab for that file.

### Security

- Reading and saving happen in a process that accepts only files the app has registered for that window, so a file the page names itself is refused.

- The app window can now write only to files you chose through a dialog, the command line, or your system's "open with"; requests that name any other path are refused.
- Requests to the app's services are checked for exact shape and size (documents up to 256 MiB), and are accepted only from the app's own window.
- The page sees a fixed, named set of app functions and nothing else.

## [0.0.1] - 2026-11-04

### Added

- Added a CodeMirror Markdown editor beside a live, syntax-highlighted preview.
- Added opening files from the command line and Open, Save, and Save As commands.
- Added atomic saves that preserve file permissions, follow symlinks, serialize overlapping writes, and retry transient Windows file locks.
- Added safe external links, task-list rendering, and source-line metadata in the preview.

### Security

- Sandboxed the renderer, enabled context isolation and a Content Security Policy, and sanitised rendered Markdown.
- Prevented preview links from navigating the app window and rejected unsupported URL schemes.

### Fixed

- Delayed showing the window until its first paint to avoid a white startup flash.

[Unreleased]: https://github.com/isumer/solidmd/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/isumer/solidmd/releases/tag/v0.0.1
