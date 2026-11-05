# Changelog

All notable changes to this project are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.4.0] - 2026-02-18

### Added

- Workspace sidebar with live file watching (#212)
- `orbit export --format pdf` for print-ready output
- Drag-and-drop tabs between windows

### Fixed

- Preview no longer jumps when a fence is edited ([#198](https://example.com/issues/198))
- Save keeps the original file when the write fails

### Changed

| Before | After | Why |
| --- | --- | --- |
| `orbit run` | `orbit start` | Clearer wording |
| 15 s timeout | 30 s timeout | Slow CI machines |

## [1.3.2] - 2026-01-30

### Security

```js
const safe = sanitize(untrusted);
render(safe);
```

> Upgrade if you render untrusted Markdown.

[1.4.0]: https://example.com/compare/1.3.2...1.4.0
