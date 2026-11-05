# Slice 5 — Tabs + safety (multiple documents, dirty tracking, crash recovery)

review: opus

**Builds on the slice under review, `auto/025-slice-4-preview-pipeline-1105-1007`**
(plus `main`). Slice 4 replaces the preview with the pipeline and edits
`src/renderer/main.ts`; this slice introduces the multi-document model on
top. It is architecture-heavy: per-document state, crash recovery and the
worker watchdog are the core, not optional. If the base's typecheck is red
when you start, first restore a green `npm run verify` on the base, then
build slice 5 on top — do not rework slice 4's preview logic beyond what a
clean merge needs.

Read AGENTS.md, docs/architecture.md §4.1 (document model), §10 (crashes,
recovery), §12 (windows, single instance), ADR-0006, ADR-0008, ADR-0009,
ADR-0011, and the files `src/renderer/core/document.ts`,
`src/renderer/core/replication.ts`, `src/renderer/main.ts`,
`src/renderer/editor/editor.ts`, `src/main/app/window.ts`,
`src/main/app/startup.ts`, `src/main/main.ts`, `src/main/io/ioWorker.ts`,
`src/shared/ipc/*`, `src/preload/preload.ts`, and the e2e helpers. No new
dependencies. You can run the full `npm run verify` here (xvfb is
available).

## Goal
Turn the single-editor app into a multi-document app: several files open as
tabs, each Document owns its text/undo/encoding and each tab owns only its
view-state (ADR-0006). Add per-tab dirty tracking and close prompts, drafts
so a renderer crash loses at most ~2 s of typing, session restore, a render
worker watchdog, and drag-and-drop. Single-instance open-with (AC-R9-03)
already exists; opening a handed-off path focuses its existing tab.

## Document registry and tabs (`src/renderer/core/document.ts`, new tab UI)
- One Document per canonical path, with the fields ADR-0006 names (grant,
  path, encoding, EOL, language, read-only, `saved = { text, encoding, eol,
  bom, version }`, and the authoritative `EditorState` **with history**).
  A tab owns only view-state: selection, scroll anchor, folds, wrap.
- Edits from any surface are Document transactions broadcast in the same
  frame to every attached surface; closing a tab never touches history.
- **Dirty** = `!doc.eq(saved.text)` **or** encoding/EOL/BOM differ from
  `saved`; evaluated at most once per frame. Undoing back to saved text
  clears it; converting line endings sets it.
- Keep the existing save-by-version and mirror flow (ADR-0008/0009) working
  per document; a save clears only its own document's dirty marker.

## Close prompts (`src/renderer/main.ts`, tab UI, `src/shared/messages/en.ts`)
- Closing a clean tab closes at once. Closing a dirty tab (and quitting with
  dirty tabs) prompts: Cancel / Discard / Save, each doing exactly what it
  says, with plain-words messages that name the file (reuse the existing
  message catalog). Menu/quit paths go through the same prompt.

## Crash recovery and session restore (drafts)
- Draft each dirty document from its mirror off the UI thread every 2 s idle
  (10 s above 5 MB), per §10. On startup after a crash, offer the drafts;
  on a clean close, session state records the open documents and their
  unsaved text so reopening restores them (AC-R4-07/08). Serialise from the
  mirror, never `doc.toString()` on the per-keystroke path.

## Render worker watchdog (`src/renderer/workers/render/**`)
- Detect a render worker that stops responding (misses a heartbeat across a
  bounded wait) and restart it within 2.5 s; the editor must stay responsive
  throughout and the preview must recover (AC-R1-12). A render that throws
  keeps the last good preview (AC-R1-06 is slice 4's) and shows a visible
  error badge that clears on the next success.

## Drag-and-drop
- Dropping a file onto the window opens it in a new tab (AC-R4-09), through
  the same open path as the File menu (grant, fingerprint, mirror attach).

## Tests (each red against pre-change code)
- [AC-R4-01] e2e: open two files, edit/scroll each, switch tabs, assert each
  tab keeps its own text, undo history, cursor and scroll.
- [AC-R4-02] e2e: open a path that is already open → the existing tab is
  focused and no duplicate tab appears (also via a second launch / open-with
  where feasible).
- [AC-R4-03] e2e: two tabs, one dirty, one clean → only the dirty tab is
  marked; saving (or undoing to saved text) clears it.
- [AC-R4-04] e2e: closing a clean tab closes with no prompt.
- [AC-R4-05] e2e: closing a dirty tab prompts; Cancel/Discard/Save each
  behave as stated.
- [AC-R4-06] e2e: quitting with a dirty tab prompts before discarding; Save
  writes each unsaved document before quit.
- [AC-R4-07] e2e: kill the renderer after a draft → the text is recovered to
  the last draft (at most a few seconds of typing lost).
- [AC-R4-08] e2e: close and reopen the app → the previous session's documents
  reopen with unsaved changes intact.
- [AC-R4-09] e2e: drop a file onto the window → it opens in a new tab.
- [AC-R1-12] e2e: a stuck worker is restarted within 2.5 s and typing stays
  responsive throughout.
- Unit: dirty evaluation is `Text.eq`-based and touches no whole-document
  string on the edit path; draft serialisation comes from a mirror; the
  close-prompt state machine returns the right action per answer.
- Existing unit + e2e all pass (update paths only).

## Allowed files
src/renderer/**, src/main/**, src/shared/**, src/preload/**,
test/unit/**, test/e2e/**. Nothing else — no `test/fixtures/**`, no
acceptance docs, PLAN, architecture, ADRs, coverage config, workflows,
package.json. Criteria AC-R4-01…09 and AC-R1-12 are already written as
`status: planned`; do not edit the acceptance files.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per new test; name any e2e test you could not run.
