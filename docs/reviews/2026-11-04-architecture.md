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
