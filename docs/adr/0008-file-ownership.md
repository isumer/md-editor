# 0008 — One owner for every file read and write
Status: accepted (2026-11-04, after two review rounds)

**Context.** Two writers with two queues can interleave renames; encoding
and hashing in main would block menus; multi-file writes could overwrite
an open, dirty buffer.

**Decision.** FileService in the io-worker is the only code that reads or
writes document files: atomic write, per-path queue, encoding/EOL/BOM
codec, disk fingerprints, conflict checks, drafts.

| File kind | Owner |
|---|---|
| Documents (open, save, Save As target, reload) | io-worker FileService |
| Drafts | io-worker FileService (from its mirror) |
| Multi-file writes (Replace in Files, folder copy, merge MERGED) | FileService; open Documents via a Document transaction |
| Trash (sidebar delete) | FileService drains the path's queue, then asks main for `shell.trashItem` |
| Export output (PDF/HTML) | main produces the bytes; FileService writes them atomically |
| Settings, session index, recent files | main (atomic write from `node-shared`) |

- **Save sends no text.** `save(docId, version, grant)`: FileService writes
  its own mirror (ADR-0009) at that version and replies with the version;
  the renderer then sets `saved` from the Text it kept for that version.
- **Replace in Files:** unopened files are searched and written on disk;
  open Documents are searched in their buffer (mirror) and changed by a
  transaction. The preview records each file's version/fingerprint;
  apply recomputes any file whose version or fingerprint moved and shows
  it again instead of applying stale edits.
- **Startup:** the io-worker is spawned in parallel with the
  BrowserWindow; the renderer's first open waits for port readiness. Test:
  an argv file is editable within the cold-start budget.

**Consequences.** Open/save go renderer ⇄ io-worker over the port, never
through main. Memory: a 20 MB document may exist as up to four copies
(EditorState, render mirror, regex mirror, io-worker mirror, ~40 MB each
as UTF-16); mirrors are created only while needed (render only for
previewed Markdown, regex only during a search) and dropped when idle.

**Reverse if** measurements show the port hop breaks the save budget and
an in-main writer can keep encoding off the main loop.
