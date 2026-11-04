# 0006 — Document owns the text; tabs and panes hold view-state
Status: accepted (2026-11-04, after two review rounds)

**Context.** Tabs, two views, clones, compare/merge panes, previews,
drafts, external changes, macros. If text lives in UI components they
fight over it.

**Decision.**
- **One Document per canonical path per app.** Canonical path =
  `fs.realpath.native` (on-disk casing), computed by the io-worker. The
  app-wide registry (path → window + document id) lives in **main**; a
  second window opening the path focuses the first.
- A Document owns grant, path, encoding, EOL, BOM, language, read-only,
  `diskFingerprint` (mtime, size, hash), `saved = { text, encoding, eol,
  bom, version }`, and the authoritative `EditorState` **with history**.
- A tab or pane owns only a **view-state**: selection, scroll anchor,
  folds, per-tab wrap. No surface owns text; edits from any surface are
  Document transactions broadcast in the same frame; closing a tab never
  touches history.
- **Dirty** = `!doc.eq(saved.text)` **or** encoding/EOL/BOM differ from
  `saved`. `Text.eq` short-circuits on length/line count and shared
  subtrees; dirty is evaluated at most once per frame. Perf test: a
  one-character edit on 20 MB evaluates in < 1 ms.
- **External change** (new fingerprint): clean → reload as one annotated
  transaction; dirty → conflict banner (Reload / Keep mine / Compare).
- **Compare/merge panes** attach to Documents or read-only scratch
  Documents; chunk accepts are Document transactions; apply-all is one.
- **Multi-file writes** to a path with an open Document are a transaction
  on that Document (one undo step); see ADR-0008 for Replace in Files.

**Consequences.** Editor views are disposable; sessions serialise
Documents. Inactive tabs cost their state; preview caches are evictable.

**Reverse if** shared-state broadcasting cannot meet the same-frame
budget for clones.
