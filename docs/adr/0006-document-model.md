# 0006 — Document owns the text; tabs and views point at it
Status: proposed (2026-11-04)

**Context.** Tabs, two views, cloned tabs (one document visible twice with
one undo history), compare/merge panes, previews, drafts. If the text
lives in UI components, clones and recovery fight over it.

**Options.** One `EditorView` per tab holding its own state · a Document
model owning one `EditorState`, with views attached on demand.

**Decision.** `Document` (core) owns path, encoding, EOL, language,
saved version and the single `EditorState`. `Tab` → `Document`; `View` →
ordered tabs. Visible editors attach to the document's state; a clone uses
CodeMirror's split-view forwarding. Dirty = version ≠ saved version.

**Consequences.** Editor views are cheap and disposable; session/draft
code serialises Documents, not UI. Memory for inactive tabs is the state
only (preview caches are evictable).

**Reverse if** CodeMirror's state sharing cannot meet the same-frame
budget for clones.
