# 0002 — CodeMirror 6 as the editor
Status: accepted (2026-11-04)

**Context.** Large files (20 MB), ~100 languages, multiple cursors, column
selection, folding, two views of one document, a merge view.

**Options.** CodeMirror 6 · Monaco (VS Code's editor) · a custom editor.

**Decision.** CodeMirror 6: viewport-virtualised rendering, incremental
Lezer parsing, immutable state that two views can share, an official
merge view, modular (~150 KB for what we use vs. Monaco's ~3 MB and its
worker setup).

**Consequences.** Some Notepad++ features (column editor, macros, smart
highlight) are written as CodeMirror extensions by us.

**Reverse if** a required capability (e.g. very long single lines) cannot
meet the budget and Monaco demonstrably does.
