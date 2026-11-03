# 0008 — One owner for every file read and write
Status: proposed (2026-11-04, from architecture review finding 1)

**Context.** Revision 1 said "main is the only writer" while putting
Replace in Files and folder copy in the io-worker; the per-path write
queue is an in-memory map, so two writers could interleave; encoding and
hashing in main would break the "main is a router" rule; nothing said
what a multi-file write does to a file open (and dirty) in a tab.

**Options.** FileService in main · FileService in the io-worker · each
service writes for itself.

**Decision.** FileService lives in the io-worker and is the only code
that reads or writes document files: atomic write, per-path queue,
encoding/EOL codec, disk fingerprints, conflict checks, drafts. Main
keeps dialogs and grants. A multi-file write to a path with an open
Document becomes a transaction on that Document (one undo step), never a
write behind it.

**Consequences.** Open/save cross renderer → io-worker over the port
(no 20 MB clone through main). Main's `saveDocument` goes away. The
io-worker must be up before the first open; startup orders it.

**Reverse if** measurements show the port hop costs more than the save
budget allows and an in-main writer can keep encoding off the main loop.
