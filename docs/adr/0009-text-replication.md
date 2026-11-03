# 0009 — Workers mirror documents and receive deltas
Status: proposed (2026-11-04, from review finding 3)

**Context.** Slice 1 sends `doc.toString()` to the render worker on every
change; for 20 MB that is a full flatten + structured clone per keystroke
on the UI thread — the budgets cannot be met.

**Options.** Full text per change · SharedArrayBuffer text · mirrors fed
with CodeMirror `ChangeSet` deltas.

**Decision.** Each consumer keeps a mirror per document and receives
`{docId, fromVersion, toVersion, changes}`; on mismatch it asks for a
resync (full text, rare). Drafts are serialised from a mirror.

**Consequences.** Version bookkeeping in core; a resync path that must be
tested. Incremental chunk parsing (PLAN "Large files") builds on it.

**Reverse if** never for large files; small documents may still send full
text if measurement shows it is simpler and inside budget.
