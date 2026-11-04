# 0007 — Typed, validated IPC with capability grants
Status: accepted (2026-11-04, after two review rounds)

**Context.** The renderer renders hostile documents; IPC and the
io-worker port are the only doors to the file system.

**Decision — contracts.** One contract per service in `shared/ipc`
(channels, request/response types, error codes, a validator per
request). Results are `Result<T, ServiceError>` (`code`, `messageKey`,
`retryable`); nothing throws across a boundary. The preload is built
from a **fixed list** of contracts, exposes per-operation functions, and
never accepts a channel name.

**Decision — two boundaries.** Main validates every IPC request and
checks `event.senderFrame` is the window's top frame. The io-worker
validates every port message with the same validators.

**Decision — grants.** Services take grants, never raw paths.
1. **Issuing.** Main issues a `DocumentGrant` for a path from a dialog,
   argv, `open-file` or drag-drop, and a `RootGrant` for Open Folder.
   Grants are random 128-bit handles bound to a window id.
2. **Ordering.** Main registers the grant with the io-worker on the
   control channel and resolves the renderer's IPC call **only after the
   io-worker acknowledges** it, so a grant the renderer holds is always
   known to the io-worker.
3. **Inside a root.** The io-worker resolves `(RootGrant, relativePath)`
   itself (realpath confinement), mints a derived `DocumentGrant`, and
   reports it to main — no extra main hop on the sidebar-click budget.
4. **Restart.** On an io-worker restart main replays every live grant per
   window, then re-issues the ports. Ports are also re-issued on
   renderer reload or `render-process-gone`; one port per webContents,
   posted to the verified main frame, held inside the preload.
5. **Persistence.** Session, recent files and last workspace are written
   by **main from its own grant table**; the renderer refers to grants by
   handle and never supplies paths to persist. On startup main re-grants
   only paths from those main-written records.
6. **Lifetime.** A grant is revoked when the last Document using it closes
   and when its window closes.

**Consequences.** Some ceremony per channel; the IPC fuzz test iterates
the contracts; a compromised renderer can act only on files the user
chose in this session (or that main restored from its own records).

**Reverse if** never expected for a security boundary.
