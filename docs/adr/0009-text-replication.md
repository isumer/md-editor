# 0009 — Workers mirror documents and receive deltas
Status: accepted (2026-11-04, after two review rounds)

**Context.** Sending `doc.toString()` per change flattens and clones up to
20 MB on the UI thread per keystroke.

**Decision.**
- Consumers (render worker, regex worker, io-worker FileService) hold a
  mirror per document and receive `{docId, epoch, fromVersion, toVersion,
  changes}` (CodeMirror `ChangeSet` JSON). A full copy is sent only on
  attach or resync.
- `(docId, epoch)` is never reused: closing/reopening or reloading a
  document starts a new epoch, and messages from an old epoch are
  dropped.
- **Resync:** the consumer requests a snapshot at version S; deltas with
  `fromVersion ≥ S` that arrive meanwhile are buffered and applied after
  it; older ones are dropped.
- **Results carry their version** (render blocks, regex hits, search
  results); the UI maps positions forward with `ChangeSet.mapPos` or
  discards them.
- Saves and drafts are written from the io-worker's mirror (ADR-0008).
- A property test fuzzes interleavings of edits, resyncs and epochs; a
  test asserts no `doc.toString()` on the UI thread per edit.

**Consequences.** Version bookkeeping in core; tested resync path;
incremental chunk parsing builds on it.

**Reverse if** never for large files.
