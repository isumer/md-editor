# Slice 3c-3 — render-worker mirror, buffered resync, versioned renders

**Builds on the slice under review, `auto/005-slice-3c-2-*`** (io-worker
mirror, `src/shared/replication/mirror.ts`, `src/renderer/core/
replication.ts`, `attachDocument`/`sendChanges`). If that branch is not on
main yet, work on top of it; do not redo it.

Read AGENTS.md, docs/architecture.md §3, §4.3, ADR-0009, then the 3c-2
brief (docs/dev/briefs/slice-3c-2.md, "Lessons from 3c-1" apply again),
src/shared/replication/mirror.ts, src/renderer/core/replication.ts,
src/renderer/editor/editor.ts, src/renderer/main.ts,
src/renderer/features/preview/**, src/renderer/workers/render/**,
src/shared/workers/render.ts. No new dependencies (`@codemirror/state` is
already used by the renderer and may be imported by the render worker).
You cannot run Electron: write e2e tests, make typecheck pass, name the
e2e tests you could not run.

## Goal
The render worker keeps a mirror of the open document, fed by the same
`ChangeSet` messages as the io-worker. Render requests name a version, not
text; results carry the version they rendered. The UI thread no longer
calls `doc.toString()` per edit.

## Shared
- `src/shared/workers/render.ts`: messages (exact-key, validated in the
  worker; `docId`, `epoch`, versions as in `shared/ipc/io.ts`):
  - to worker: `{ op: "attach", docId, epoch, version, text }`,
    `{ op: "change", docId, epoch, fromVersion, toVersion, changes }`,
    `{ op: "render", id, docId, epoch, version }`,
    `{ op: "detach", docId }`.
  - from worker: `{ id, docId, epoch, version, ok: true, html }`,
    `{ id, docId, epoch, version, ok: false, message }`, and
    `{ op: "resync", id, docId, epoch, version }` when the mirror cannot
    serve a render (absent, stale, other version).
  Reuse `shared/replication/mirror.ts`; do not copy it.

## Render worker (`src/renderer/workers/render/**`)
- Own a mirror (`Text`, `ChangeSet.fromJSON(...).apply`). A render request
  is served only from the mirror at exactly `(docId, epoch, version)`;
  otherwise reply `resync` and render nothing.
- Buffered resync: after posting `resync` for `(epoch, S)` the worker
  buffers incoming changes of that doc with `fromVersion ≥ S` (drops older
  ones) until the `attach` at version ≥ S arrives, then replays the
  buffered changes that chain from the attach version. A malformed or
  non-chaining change marks the copy stale (as the mirror does).
- The existing failure path (typed `ok: false`) is kept.

## Renderer
- `RenderScheduler` no longer holds text: `schedule()` takes no text and
  `requestRender({ id })` is built by the caller. Debounce 150 ms / max
  wait 500 ms behaviour and the "older result is ignored" rule stay
  (AC-R1-02, AC-R1-05 tests keep passing; update call sites only).
- `main.ts` posts to the render worker: `attach` on load (same moment and
  epoch as the io-worker attach), `change` per edit using the message
  `replication.ts` already builds (share it with `sendChanges`; the
  change is built once), `detach` on replace, and for each scheduled
  render `{ op: "render", id, docId, epoch, version }` with the version at
  dispatch time. On `resync` reply with `attach` of the editor's current
  `Text` (`toString()` allowed here, it is not per edit). Results for a
  different `docId`/`epoch` than the current document, or older than the
  newest applied, are ignored (extend the AC-R1-05 rule to the epoch).
- `editor.ts`: `onDocumentChanged` no longer receives text and no
  `update.state.doc.toString()` remains on the edit path. Replace the
  `scheduler.schedule(editor.state.doc.toString())` calls in `main.ts`
  with the new form. Failed render keeps the last good preview
  (AC-R1-06 unchanged).
- If the render worker is restarted (it errors or exits), the next render
  request gets `resync` and the flow above recovers; add handling only if
  the code already restarts it.

## Tests (each shown red against the pre-change code)
- [AC-R1-07] unit (render worker handler, real mirror, fake scope): render
  at the synced version renders that text; wrong version / epoch /
  unknown doc → `resync`, no html; buffered changes at `fromVersion ≥ S`
  are replayed after the attach and older ones dropped; a render after a
  non-chaining change → `resync`. Extend the 3c-2 seeded property test
  (≥ 500 runs, seed printed) or add one: random edits, epochs,
  worker resets, resync requests → a successful render equals the
  renderer's text at the result's version, never other text.
  unit (renderer flow): result for an older epoch ignored. e2e: type fast,
  the preview shows the final text (existing preview e2e keeps passing).
- [AC-PERF-05] unit: with a 20 MB document, one-character insert through
  the real `createEditor` update path (or the extracted pure part if no DOM
  test environment exists; say which) calls `Text.prototype.toString` /
  `sliceString` on the whole doc zero times and the render-worker `change`
  message `JSON.stringify` is < 1024 chars.
- [AC-R1-02], [AC-R1-05], [AC-R1-06], [AC-R5-18], [AC-R5-19], [AC-SEC-11]:
  all existing tests pass; update call sites only.

## Allowed files
src/shared/workers/render.ts, src/shared/replication/**,
src/renderer/workers/**, src/renderer/features/preview/**,
src/renderer/core/**, src/renderer/editor/editor.ts, src/renderer/main.ts,
test/unit/**, test/e2e/**. Nothing else — not src/main, not src/io-worker,
no acceptance docs, PLAN.md, architecture, coverage config or baseline,
workflows. If coverage needs a config change, stop and say so.

## Done means
typecheck, check:deps, test:unit, `npm run check:coverage`, build exit 0 —
paste; list files; red evidence per new test; name the e2e tests you
wrote and could not run.
