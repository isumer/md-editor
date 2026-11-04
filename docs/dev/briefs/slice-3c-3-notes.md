# Notes for slice 3c-3 (collected before its brief)

- 3c-2 (docs/dev/briefs/slice-3c-2.md) did the io-worker mirror and
  save-by-version. 3c-3 finishes ADR-0009 for the render worker: a
  mirror fed by the same change messages (shared/replication/mirror.ts),
  buffered resync (request a snapshot at S; buffer changes with
  `fromVersion ≥ S`, drop older), render results carrying their version,
  and the test that the UI thread calls no `doc.toString()` per edit
  (today src/renderer/editor/editor.ts flattens on every change for the
  RenderScheduler).
- Extend the 3c-2 property test with resync requests and buffering.
- Measure open/save latency again (PIPELINE-STATE baseline: 3b open
  p50 32 / p95 50 ms, save 16 / 19; 3c-1 open 41 / 58, save 14 / 18).
- e2e coverage merge (PLAN "Code coverage") is still open; Claude does
  it as its own step because Codex cannot run Electron.
- `@codemirror/state` is imported directly by the renderer and the
  io-worker but is only a transitive dependency (via codemirror). Ask
  the user whether to declare it in package.json.
