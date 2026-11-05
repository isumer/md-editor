# Changelog

All notable changes to MD Editor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A set of ten sample documents (README, notes, raw HTML, CRLF, Turkish and CJK text, very long lines) whose preview output is checked against reviewed snapshots, so rendering changes show up as visible diffs.
- A reference table of the 36 languages code blocks are highlighted in, with a small sample file for each, as groundwork for opening source files.

### Changed

- The app now loads from its own private address instead of a local file, serves only its own files, and no longer lets the page load images from local file paths.

- Typing no longer builds a copy of the whole document for the preview: the preview worker keeps its own copy fed by the same small changes, and always renders exactly the version it names, asking for the document again if it fell behind.
- Saving no longer sends the whole document to the file process: it keeps its own copy, fed only the changes you type, and Save writes exactly the version you saved. If that copy is ever lost or behind, the editor resends the document once and the save still succeeds.

- Open and save failures now name the file and explain the reason in plain words, for example "Could not open “notes”: it is a folder."
- Files are now read and saved by a separate background process. If that process crashes, the app restarts it and Save keeps writing to the same file without asking for a path again. A save caught by the crash says so, and the document stays marked unsaved so you can try again.

### Fixed

- A message saying a save failed no longer disappears as soon as the preview updates after your next edit.

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

[Unreleased]: https://github.com/isumer/md-editor/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/isumer/md-editor/releases/tag/v0.0.1
