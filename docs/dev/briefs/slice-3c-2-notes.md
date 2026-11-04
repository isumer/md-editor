# Notes for slice 3c-2 (collected before its brief)

- 3c was split at review of 3b (2026-11-04): 3c-1 moves file I/O into
  the io-worker with the grant control channel and port; 3c-2 does the
  rest of architecture.md §13 "3c": save-by-version and io-worker
  mirrors (ADR-0008 "Save sends no text", ADR-0009 deltas, epochs,
  resync property test, "no doc.toString() on the UI thread per edit").
- §13 also asks for open/save latency measured before and after the
  io-worker. Vision cannot launch Electron, so Friday measures at the
  3c-1 review (open via stubbed dialog and Save of a 100 KB file,
  N ≥ 30, p50/p95) and records the numbers in PIPELINE-STATE.md; 3c-2
  repeats them.
- e2e coverage merge (PLAN "Code coverage": NODE_V8_COVERAGE for main
  and io-worker, Playwright coverage for the renderer, merged with unit
  coverage) is due "in 3c". It needs an e2e run to tune, which Vision
  cannot do; Friday may do it as its own step after 3c-2.
- MessageKey is declared twice (src/shared/ipc/result.ts and
  src/shared/messages/en.ts) because the shared-no-dependencies rule
  forbids shared files importing each other; typecheck catches drift at
  the formatMessage call sites. Revisit if the rule is relaxed for
  type-only imports inside shared.
