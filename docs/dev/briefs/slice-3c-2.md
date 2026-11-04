# Slice 3c-2 — io-worker mirror and save-by-version

Read AGENTS.md, docs/architecture.md §3, §4.3, §7, §9 and ADR-0006,
0008, 0009 first, then src/io-worker/**, src/preload/preload.ts,
src/shared/ipc/io.ts and src/renderer/main.ts as 3c-1 left them.
**3c-2** makes "Save sends no text" true (ADR-0008): the io-worker keeps
a mirror of each open document, the renderer sends it `ChangeSet`
deltas per edit, and Save names a version. **3c-3** (later) does the
render-worker mirror, buffered resync, versioned render results and the
"no `doc.toString()` on the UI thread per edit" test; leave the render
path (`onDocumentChanged(text)` → RenderScheduler) as it is. No new
dependencies; `@codemirror/state` (already installed, already imported
by src/renderer/editor) may be imported by src/io-worker/**.

## Lessons from 3c-1 (read before writing tests)
- The preload runs sandboxed and unbundled: `import type` only from
  src/shared; copy runtime constants as literals with `satisfies`.
- Windows CI: `os.tmpdir()` is an 8.3 short path (`RUNNER~1`); the
  io-worker returns `fs.realpath`'s long one. Unit tests that compare
  paths must `fs.realpath` their temp dir first.
- e2e: after `launchEditor(file)` wait for the file's text in the
  editor before clicking or typing; the argv file arrives over the
  port and typing earlier edits an untitled buffer.
- e2e: menu commands reach the renderer in order. To know the renderer
  has acted on one (e.g. Save posted its message), click a later item
  whose effect is observable (Open with `stubOpenDialog(app, null)`,
  then poll `dialogCallCount(app, "open")`). Never sleep.
- The status bar is shared with the preview: file errors use
  `showStatus`; the preview may clear only its own message.
- You cannot run Electron. Write the e2e tests, make typecheck pass,
  and name the e2e tests you could not run. Friday runs them.

## Shared (`src/shared`, imports nothing — not even `@codemirror/state`)
- `src/shared/ipc/io.ts` — the port contract becomes (all exact-key,
  validated on both sides like 3c-1; `docId` string 1..128 chars,
  `epoch` / versions safe integers ≥ 0):
  - request `{ id, op: "read", grant }` → `{ name, text }` (unchanged)
  - request `{ id, op: "attach", docId, epoch, version, text }` → `{}`
    (full copy: on load, after a restart, or on resync; text ≤ 256 MiB)
  - request `{ id, op: "save", grant, docId, epoch, version }` →
    `{ name, version }`
  - one-way `{ op: "change", docId, epoch, fromVersion, toVersion,
    changes }` with `toVersion === fromVersion + 1`; `changes` is
    `ChangeSet.toJSON()` output, validated structurally (array of
    non-negative safe integers or arrays `[len, ...strings]`, total
    inserted length ≤ 256 MiB). No reply.
  - one-way `{ op: "detach", docId }`. No reply.
  - The `write` op is **removed**: no port message carries the text of a
    save.
- `src/shared/replication/mirror.ts` (new): the pure mirror state
  machine, generic over the document type with `apply(doc, changes)`
  injected, so the io-worker (and in 3c-3 the render worker) share it.
  Per docId: absent → synced `{ epoch, version, doc }` → stale.
  `attach` with epoch ≥ the current one replaces the copy; a change with
  an older epoch is dropped; a change whose `fromVersion` is not the
  copy's version, whose epoch is newer, or whose `apply` throws marks it
  stale; `docAt(docId, epoch, version)` returns the doc only when synced
  at exactly that epoch and version.
- New error code `OUT_OF_SYNC` (retryable) with message key
  `file.outOfSync`: "Could not save “{file}”: the file service lost
  track of the document. Try again." (src/shared/ipc/result.ts,
  src/shared/messages/en.ts).

## io-worker
- `src/io-worker/mirrors.ts` (new): per-window table of mirrors using
  `Text` and `ChangeSet.fromJSON(changes).apply(doc)` from
  `@codemirror/state`. At most 64 documents per window (an attach beyond
  that → `BAD_REQUEST`). A window's mirrors are dropped on `revokeWindow`
  and when its port is replaced.
- `save`: resolve the grant for the port's window (AC-SEC-12 rules
  unchanged), take the mirror's `Text` at `(docId, epoch, version)`
  **synchronously when the message arrives** (a change that arrives
  while the write runs must not leak into the file), then
  `atomicWrite(path, doc.toString())` with the writability check and
  errno mapping from 3c-1. No copy at that version → `OUT_OF_SYNC`
  naming no file (the renderer fills it in, as for `WORKER_RESTARTED`).
- Changes and detaches are applied in port order; invalid ones are
  dropped without a reply and never throw.

## Preload and window.api (update the AC-SEC-11 list and e2e)
`writeDocument` is removed. Added: `attachDocument({ docId, epoch,
version, text })` → `Result<void>`, `saveDocument({ grant, docId,
epoch, version })` → `Result<{ name, version }>`, `sendChanges({ docId,
epoch, fromVersion, toVersion, changes })` → `void`, `detachDocument
({ docId })` → `void`. Requests and one-way messages share one FIFO
until the first port arrives, so their order is kept. On port
replacement pending requests still fail with `WORKER_RESTARTED`.

## Renderer
- `src/renderer/core/replication.ts` (new, imports `@codemirror/state`
  only): per document `{ docId, epoch, version }`; a new epoch on every
  load into the editor (open, open request, Save-As adoption keeps the
  epoch); `version` +1 per transaction with `docChanged`; builds the
  change message from `update.changes` without flattening the document.
- `src/renderer/editor/editor.ts`: also hand `update.changes` to a new
  callback (keep `onDocumentChanged(text)` for the render path).
- Load: after reading and accepting a document, `attachDocument` at
  version 0 of a new epoch; `detachDocument` the old one.
- Save: keep the editor's `Text` for the version being saved;
  `saveDocument`; on success `saved = thatText` and dirty is
  `!editor.state.doc.eq(saved)` (replace the `toString()` comparison in
  `markSavedIfCurrent`). On `OUT_OF_SYNC`: `attachDocument` with the
  kept `Text` at that version and retry the save **once**; any other
  failure (or a second `OUT_OF_SYNC`) is shown as today. Untitled Save /
  Save As: `chooseSaveTarget`, then the same save with the new grant.

## Tests (criteria ids; each shown red against the pre-change code)
- [AC-R5-18] unit (io-worker, fake port, real temp dir): attach v0,
  change → v1, save v1 and change → v2 posted in the same tick → file
  holds v1, reply `{ name, version: 1 }`. unit (contract): a save
  message with a `text` key is refused. e2e: the existing AC-R5-14
  in-flight test passes unchanged; Save writes exactly the edited text.
- [AC-R5-19] property test (unit, no new dependency: a seeded PRNG in
  the test, ≥ 500 runs, seed printed on failure): random edits via real
  `ChangeSet`s, new epochs, mirror resets (restart), old-epoch and
  duplicated changes, saves at random versions → `docAt` is either
  exactly the renderer's `Text` at that version or absent, never other
  text; after an attach it is present. unit (renderer flow without DOM
  if reachable, else e2e): `OUT_OF_SYNC` → one attach + one retry.
  e2e: kill the io-worker, edit, Save → the file has the text and no
  dialog opened (the 3c-1 restart test, now through resync).
- [AC-PERF-04] unit: a 20 MB document, one-character insert → the change
  message `JSON.stringify` is < 1024 chars; unit (preload, fake port):
  `sendChanges` posts exactly the change message, no `text` key.
- [AC-SEC-13] unit (io-worker, fake port): extra key, own `__proto__`,
  negative / fractional / > MAX_SAFE_INTEGER versions, `toVersion ≠
  fromVersion + 1`, malformed `changes` (wrong lengths so `apply`
  throws), another window's docId, old epoch, a 65th attach → no mirror
  changed, nothing written, the next valid message still answered.
- [AC-SEC-11] the fixed API list (unit snapshot and e2e) updated.
- All existing tests pass; update only call sites.

## Allowed files
src/shared/ipc/io.ts, src/shared/ipc/result.ts,
src/shared/messages/en.ts, src/shared/replication/** (new),
src/io-worker/** , src/preload/preload.ts, src/renderer/core/** ,
src/renderer/editor/editor.ts, src/renderer/main.ts,
src/renderer/platform/** , test/unit/** , test/e2e/** . Nothing else —
not src/main, not the render worker, no acceptance docs, PLAN.md,
architecture, coverage config or baseline, workflows. If coverage needs
a config change, stop and say so in the report.

## Done means
typecheck, check:deps, test:unit (coverage ≥ baseline:
`npm run check:coverage`), build exit 0 — paste; list files; red
evidence per new test; the e2e tests you wrote and could not run, named.
