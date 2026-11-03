# 0007 — Typed, validated IPC contracts in `shared/ipc`
Status: proposed (2026-11-04)

**Context.** The renderer renders hostile documents; if it were ever
compromised, IPC is the only door to the file system. Today channel names
are duplicated in preload and main.

**Options.** Free-form `ipcMain.handle` per feature · contracts in shared
with validators and a generated preload.

**Decision.** One contract file per service: channels, request/response
types, error codes, a validator per request. Main validates every request
(type, size, path policy) and checks `senderFrame`; handlers return
`Result<T, ServiceError>` and never throw across IPC. The preload API is
generated from the contracts (or built from them at runtime by one
generic function), so names cannot drift.

**Consequences.** A little ceremony per channel; the IPC fuzz test can
iterate the contracts automatically.

**Reverse if** never expected for a security boundary.
