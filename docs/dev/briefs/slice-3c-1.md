# Slice 3c-1 — io-worker: spawn, control channel, port, FileService move

Read AGENTS.md, docs/architecture.md §2, §7, §9, §12, §13 and ADR-0004,
0007, 0008 first. 3c is split: **3c-1** (this brief) moves all document
reads and writes into an Electron `utilityProcess` and wires the grant
protocol to it; **3c-2** (later) replaces "save sends text" with
save-by-version and mirrors (ADR-0008/0009). Here the renderer still
sends the text to save, but over its MessagePort to the io-worker,
never through main. No new dependencies.

## Lessons from 3b (read before writing the preload)
- The preload runs **sandboxed and unbundled**: at runtime it can
  `require` only `electron`. Import from `src/shared` with `import type`
  only; copy channel names as literals tied to shared with
  `as const satisfies typeof SHARED_CONST` (see src/preload/preload.ts).
  `check:deps` rule `preload-types-only` enforces this.
- Opening a file must not revoke the current document's grant: the
  renderer asks "Discard unsaved changes?" *after* the open returns and
  may keep the old document (test "declining to discard changes for
  another file keeps Save writing the current one").
- You cannot run Electron in your sandbox. Write the e2e tests anyway,
  make typecheck pass, and say in the report which e2e tests you could
  not run. Friday runs them.

## Processes
- `src/io-worker/main.ts`: entry, started by main with
  `utilityProcess.fork(<dist>/io-worker/main.js, [], { serviceName:
  "io-worker" })` **in parallel with** creating the BrowserWindow
  (startup sequence, §2). Add `src/io-worker/**/*.ts` to
  tsconfig.main.json.
- `src/io-worker/services/file.ts`: FileService — `read(grant)` →
  `{ name, text }`, `write(grant, text)` → `{ name }`, using
  `node-shared/atomicWrite`, the writability check and the errno →
  ServiceError mapping from 3b (file name in params). Per-path queue is
  atomicWrite's.
- `src/io-worker/grants.ts`: the io-worker's grant table, filled only by
  main over the control channel: `(windowId, handle) → canonicalPath`.
  A port belongs to one window; a message's grant is resolved against
  that port's window only.
- Main does **no document I/O** after this slice: `src/main/services/
  file.ts` keeps only dialogs (rename to `src/main/services/
  fileDialogs.ts`), and new dependency rule `main-no-document-io`
  forbids `src/main/**` → `src/node-shared/atomicWrite`. (`isFile` for
  argv filtering stays in main.)

## Control channel (main ⇄ io-worker, `child.postMessage` / `process.parentPort`)
Contract file `src/shared/ipc/ioControl.ts` with validators (both sides
validate). Messages: `registerGrant { id, windowId, handle, path,
mustExist }` → reply `{ id, result: Result<{ canonicalPath, name }> }`
(the io-worker canonicalises with `fs.realpath`; a missing path is OK
only when `mustExist` is false, i.e. a Save As target); `revokeGrant
{ windowId, handle }`; `revokeWindow { windowId }`; `attachPort
{ windowId }` with the transferred `MessagePortMain`.
- **Ordering (ADR-0007 §2):** main resolves the renderer's IPC call that
  returns a grant only **after** the io-worker's `registerGrant` reply.
  A failed registration (e.g. missing file) is returned to the renderer
  as that ServiceError and no grant is issued.

## Renderer port (renderer ⇄ io-worker)
- Main creates a `MessageChannelMain` per webContents, sends one end to
  the io-worker (`attachPort`) and the other to the renderer with
  `webContents.postMessage("io:port", null, [port])` — to the verified
  main frame only — on `did-finish-load` and again after an io-worker
  restart. Closing/re-issuing on reload follows from `did-finish-load`.
- Contract file `src/shared/ipc/io.ts`: requests `{ id, op: "read",
  grant }` and `{ id, op: "write", grant, text }`, replies `{ id,
  result }`; exact-key validators with the same limits as 3b (text ≤
  256 MiB, grant ≤ 8 KiB). The io-worker validates every port message;
  invalid → BAD_REQUEST reply (or dropped if it has no usable `id`),
  never a throw.
- The preload holds the port (never handed to page script), correlates
  replies by id, queues requests until the first port arrives, and when
  a new port replaces the old one fails every pending request with
  `WORKER_RESTARTED` (add the code and message key
  `file.workerRestarted`: "Could not save “{file}”: the file service
  restarted. Try again.", retryable: true).

## window.api (fixed list; update the AC-SEC-11 snapshot and e2e list)
`openFile()` → `Result<{ grant, name } | null>` (dialog in main, grant
registered) · `chooseSaveTarget({ grant | null })` → `Result<{ grant,
name } | null>` (Save As / untitled Save dialog; registers a new grant
with `mustExist: false`) · `readDocument(grant)` and
`writeDocument({ grant, text })` (over the port) · `releaseDocument
({ grant })` (IPC; main revokes in its table and in the io-worker) ·
`openExternal`, `readyForOpenRequests`, `onMenuCommand`,
`onOpenRequest` (open requests now carry `{ grant, name }`; the renderer
reads the text over the port). `saveFile` / `saveFileAs` are removed.

## Renderer flow (src/renderer/main.ts, platform/api.ts)
- Open (menu or open request): get `{ grant, name }`, `readDocument`,
  then ask to discard if dirty; on display `releaseDocument` the old
  grant, on decline release the new one.
- Save with a grant: `writeDocument`. Untitled Save / Save As:
  `chooseSaveTarget`, then `writeDocument` with the new grant; on success
  adopt it and release the old one; on failure release the new one and
  keep the old. The 3b interim "Save As revokes the request grant" in
  main goes away (ADR-0007 §6: revoke when the document using it closes).
- Behaviour the user sees is unchanged: every existing e2e test passes
  with only `window.api` call sites in test/e2e updated.

## Restart (§2 crash containment)
- Main supervises the io-worker: on an unexpected `exit`, respawn,
  replay every live grant per window (`registerGrant` for each, from
  main's GrantTable, which needs an `entries(windowId)`), then re-issue
  ports. At most 5 restarts per 60 s (injected clock); past that, log
  and stop — requests fail with `WORKER_RESTARTED`.
- Log each restart as a structured line (`event: "io-worker-exit"`,
  code/signal), no document content.

## Tests (criteria ids; each shown red against the pre-change code)
- [AC-SEC-12] unit: io-worker message handling with a fake port — raw
  path, unknown, revoked and other-window grant, extra key / own
  `__proto__` / 257 MiB text / wrong types → typed error, nothing read
  or written (real temp dir), next valid message still answered. e2e:
  `window.api.writeDocument` with a raw path and with a forged grant
  writes nothing.
- [AC-SEC-07] control-channel validators on valid / invalid / hostile
  input (unit).
- [AC-SEC-09] the existing grant tests keep passing; add: a released
  grant is refused by the io-worker (e2e via `releaseDocument`, then
  `writeDocument`), and a declined open releases the new grant (unit on
  the renderer-side flow if it can be reached without DOM, else e2e).
- [AC-R5-17] e2e: open, edit, kill the io-worker (`application.evaluate`
  → `app.getAppMetrics()`, the `Utility` process whose `serviceName` /
  `name` is the io-worker → `process.kill(pid, "SIGKILL")` from the test
  side), wait for the new process, Save → the same file has the text and
  no save dialog was shown. unit: the preload port client fails pending
  requests with WORKER_RESTARTED when a new port arrives; main's
  supervisor replays grants before re-issuing ports and stops after 5
  restarts in 60 s (fake clock, fake child).
- [AC-PERF-03] e2e: launch with an argv file; measure from just before
  `electron.launch` until the editor shows the file's text and a typed
  character appears; assert < 2 s. This checks the startup sequence
  (window and io-worker in parallel, first read waits for the port), so
  one launch is enough here; it is not a percentile budget.
- [AC-R5-01 … AC-R5-16] all existing tests pass; update only call sites.
- main does no document I/O: a planted-violation fixture for
  `main-no-document-io` in test/fixtures/depcruise + the existing
  dependencyRules unit test pattern.

## Allowed files
src/io-worker/** (new), src/main/** , src/preload/preload.ts,
src/shared/ipc/** , src/shared/messages/en.ts, src/renderer/main.ts,
src/renderer/platform/** , src/renderer/core/document.ts,
.dependency-cruiser.cjs (one new rule), tsconfig.main.json (include),
test/unit/** , test/e2e/** , test/fixtures/depcruise/** . Nothing else —
no acceptance docs, PLAN.md, coverage config or baseline, workflows.
If coverage needs a config change, stop and say so in the report.

## Done means
typecheck, check:deps, test:unit (coverage ≥ baseline), build exit 0 —
paste; list files; red evidence per new test; the e2e tests you wrote
and could not run, named.
