# 0004 — Heavy I/O in a utility process; main stays a router
Status: proposed, revised (2026-11-04)

**Context.** Workspace trees, file watching, Find/Replace in Files over
thousands of files, folder compare with hashing. In Electron, a busy main
process freezes menus, dialogs and window management for every window.

**Options.** Do it in main with async fs · Node `worker_threads` in main ·
Electron `utilityProcess` · in the renderer via IPC per file.

**Decision.** One `utilityProcess` ("io-worker") hosts Workspace, Watch,
Search and FolderCompare services. The renderer reaches it over a
`MessagePort` that main brokers once, so streamed results bypass main.
Main keeps single-file operations (open, save) that the user waits on.

**Consequences.** One more process to supervise (restart on crash, typed
`WORKER_RESTARTED` errors). The path policy module is shared by main and
the io-worker.

**Reverse if** measurements show the extra hop costs more than a frame on
interactive operations and `worker_threads` in main achieve the same
isolation.

**Amendment (review findings 1, 4).** The io-worker also owns all file
reads/writes (ADR-0008); main keeps only dialogs and grants — the
earlier line "Main keeps single-file operations" is withdrawn. Search
and hashing run in worker_threads owned by the io-worker, one per job,
killed on cancel or time limit, so a runaway regex never stalls the tree
or watcher (answers the one-vs-many io-worker question).
