# Architecture review — 2026-11-04

Reviewer: cereblnk architect-agent (read-only). Subject: docs/architecture.md
revision 1 + ADR 0001–0007. Verdict: **accept with changes** (two
blockers). Confidence 0.75; claims about CodeMirror/Electron internals
marked assumed need spikes, but no resolution depends on them.

| # | Sev. | Finding | Resolution (revision 2) |
|---|---|---|---|
| 1 | blocker | No single owner for writes/decoding; Replace in Files could silently lose edits to an open dirty file; main would hash/encode | ADR-0008: io-worker FileService owns all reads/writes; multi-file writes to open Documents go through the Document; §2, §4.1, §9 |
| 2 | blocker | io-worker MessagePort bypasses main's validation; renderer chooses write paths (`main.ts` saveDocument) | ADR-0007 amended: grants, second validation boundary, port lifecycle, fixed preload; §7 |
| 3 | major | Whole document cloned to workers per keystroke (`app.ts` toString) | ADR-0009 text replication; §4.3 |
| 4 | major | Work in the wrong place; PLAN says "in main"; one io-worker loop has head-of-line blocking; PDF window unspecified | ADR-0004 amended (per-job worker_threads); PLAN wording fixed; export window spec §2; merge-view spike as ADR-0002 reversal condition |
| 5 | major | Document model gaps: compare panes duplicate state, clone ownership, dirty undefined, external changes, macros absolute | ADR-0006 amended; §4.1–4.2 |
| 6 | major | Dependency rules contradict model; not enforceable with no-restricted-imports | §3 rewritten: core may import @codemirror/state; new `editor/` layer; `node-shared/`; dependency-cruiser + planted-violation tests |
| 7 | major | Menu dead without renderer; accelerator double ownership; AltGr; targets; macOS open-file | ADR-0005 amended; §5 |
| 8 | major | `file:` images (NTLM leak), app on `file://` | ADR-0010 asset protocol; §8 |
| 9 | minor | Solid sound; core stores must stay framework-free | ADR-0003 accepted with amendment; §6 |
| 10 | minor/major | Multi-window keying, i18n keys, a11y, updater, settings fan-out, recovery point, plugin non-goal | ADR-0011; §5 i18n; §10–§12; §1 non-goals |
| 11 | major | Slice-3 move not pure; thin characterisation net | §13: characterisation tests first, slice 3 split into 3a/3b/3c |

Next: second review round on revision 2 before ADRs 0004–0011 are
accepted.

## Round 2 (revision 2 → revision 3)

Verdict on revision 2: **accept with changes**, no blockers; 3 findings
closed, 2 closed with residuals, 6 partial; 14 new findings (4 major).
Confidence 0.8.

| # | Sev. | Finding | Resolution (revision 3) |
|---|---|---|---|
| N-1 | major | Grant lifecycle: ordering race, io-worker restart, persisted grants from the renderer, grants inside roots, no revocation | ADR-0007 rewritten: ack-before-resolve, replay on restart, main-written persistence only, io-worker-minted derived grants, revocation |
| N-2 | major | Save still sends the whole text; saved-version consistency | ADR-0008: `save(docId, version, grant)` from the io-worker mirror; memory budget stated |
| N-3 | major | `doc-asset://` handler runs in main; no window check | ADR-0010: window id in URL, grant check in main, io-worker resolves, `net.fetch` streaming — documented exception |
| N-4 | major | 3b too big; characterisation tests pinned to "in main" | §13: steps 3.0 + 3a–3e; tests phrased at contract level |
| N-5 | minor/major | macOS Edit roles bypass the registry (undo, macros) | ADR-0005: Undo/Redo are commands; only clipboard/select-all/IME/app roles stay native |
| N-6 | minor | Dirty misses EOL/encoding/BOM; invented chunk hash | ADR-0006: dirty includes encoding/EOL/BOM; `Text.eq`; < 1 ms test |
| N-7 | minor | Resync race | ADR-0009: epochs, buffered deltas, versioned results, interleaving property test |
| N-8 | minor | Unlisted writers (trash, export, settings) | ADR-0008 file-kind owner table |
| N-9 | minor | Dependency table gaps | §3: solid-js in features, composition root, `shared/workers/`, worker packages |
| N-10 | minor | Replace in Files over dirty buffers | ADR-0008 + §4.1: buffer for open docs, recompute on version/fingerprint change |
| N-11 | minor | ADR bodies contradict amendments; stale PLAN | ADRs 0005–0010 rewritten; PLAN architecture section now points to the doc |
| N-12 | minor | Screen-reader rule vs never-freeze | §11: cap at 2,000 blocks, notice above |
| N-13 | minor | Canonical path casing; registry location | ADR-0006: `realpath.native` in io-worker; registry in main |
| N-14 | minor | Startup ordering budget | §2 startup sequence; ADR-0008 startup line; test |

All ADRs 0001–0011 accepted. Remaining assumptions (protocol.handle in
main, shell availability in utilityProcess, macOS key-equivalent order,
`Text.eq` subtree skipping) are verified by spikes in the slice that
first depends on them.
