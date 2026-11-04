# Slice 3b — IPC contracts, typed errors, fixed preload, grants (FileService still in main)

Read AGENTS.md, docs/architecture.md §7 and ADR-0007 (the grant protocol)
first; docs/dev/briefs/slice-3b-notes.md has two cases moved here from 3.0.
FileService stays in main in this step (the io-worker is 3c). Grant parts
that involve the io-worker (ack ordering, replay after restart) are 3c;
here the grant table lives in main, keyed by window id.

## Contracts (src/shared/ipc/)
- One file per service: `file.ts` (open, save, saveAs, openRequestsReady,
  open requests stream), `link.ts` (openExternal), `menu.ts` (menu
  commands main → renderer). Each exports its channel names, request /
  response types, and a **validator per request** (hand-written,
  dependency-free): exact keys (unknown keys — including an own
  `__proto__` — rejected), types, and limits (text ≤ 256 MiB; strings
  used as URLs ≤ 8 KiB). Validators are pure and unit-tested on valid,
  invalid and hostile inputs.
- `result.ts`: `Result<T> = { ok: true, value } | { ok: false, error:
  ServiceError }`, `ServiceError = { code, messageKey, params, retryable }`.
  Stable codes: BAD_REQUEST, NOT_FOUND, IS_DIRECTORY, PERMISSION_DENIED,
  DISK_FULL, CONFLICT, GRANT_INVALID, FORBIDDEN_SENDER, UNSUPPORTED_SCHEME,
  TOO_LARGE, UNKNOWN. Map Node errno codes (ENOENT, EISDIR, EACCES/EPERM,
  ENOSPC…) in one place.
- `src/shared/messages/en.ts`: the message catalog (`messageKey` →
  English template with `{file}`, `{reason}` params) and a pure
  `formatMessage(key, params)`. The renderer shows formatted messages
  (AC-R5-16): e.g. "Could not open “notes”: it is a folder."

## Grants (src/main/grants/)
- `GrantTable` keyed by window id: issue(windowId, canonicalPath, kind
  "document") → opaque 128-bit random handle (crypto.randomBytes,
  base64url); resolve(windowId, handle) → path or GRANT_INVALID; revoke on
  window close; `revokeDocument` when the renderer closes the document
  (today: when it opens another file).
- Grants are issued only where a user chose a path: open dialog, save
  dialog (Save As / untitled Save), argv, second-instance argv, macOS
  open-file. `OpenedFile` and `SavedFile` carry `{ grant, name, text? }` —
  the renderer never receives or sends absolute paths for writing. (The
  display name for the title is the basename; a full path for tooltips
  can come later as data, never as authority.)
- save(grant, text) / saveAs(grant | null, text): resolve the grant;
  unknown / other-window / revoked → GRANT_INVALID, nothing written.

## Boundary checks (src/main/ipc/)
- One `handle(contract, handler)` helper: verify `event.senderFrame` is the
  top frame of a BrowserWindow we created (frame === webContents.mainFrame,
  url starts with our app URL) else FORBIDDEN_SENDER; run the contract
  validator else BAD_REQUEST; call the handler; map thrown errors to
  ServiceError; never throw across IPC.

## Preload
- Built from a **fixed list** of contracts: exposes `window.api` with one
  function per operation (no generic invoke/send, no channel parameter).
  Rename `window.mdApi` → `window.api` everywhere (tests included).
- A unit test snapshots the exposed member names; an e2e test lists
  `Object.keys(window.api)` and checks no other preload global exists.

## Tests (criteria ids)
- Restore the two 3.0 cases (own `__proto__` key; text > 256 MiB, use
  257 MiB) through `window.api.saveFile` [AC-SEC-07].
- Forged / unknown / revoked / other-window grant; a raw path in place of a
  grant [AC-SEC-09]. Second window for the other-window case may be
  simulated in the unit test of GrantTable + handler.
- Sender-frame check: unit-test `handle` with a fake event whose
  senderFrame is a subframe / foreign URL [AC-SEC-10]; e2e: an iframe is
  not possible in our CSP, so unit level is the right layer — say so.
- Preload shape [AC-SEC-11].
- Named failures: missing, folder, permission (POSIX), plus save to a
  read-only file — message names the file [AC-R5-16]; update the 3.0
  directory test from /EISDIR/ to the file name (Protected-change is
  Claude's to add).
- All existing tests pass after updating `mdApi` → `api` and path → grant
  shapes. Each new test shown red against the pre-change code.

## Done means
typecheck, check:deps, test:unit (coverage ≥ baseline), build exit 0 —
paste; list files; red evidence per new test.
