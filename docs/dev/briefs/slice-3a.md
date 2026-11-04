# Slice 3a — pure move into the architecture layout + dependency rules

Read AGENTS.md and docs/architecture.md §3 and §13 first. This step
**moves code without changing behaviour**: same IPC channel names, same
`window.mdApi`, same menu, same messages. The full suite (unit, e2e,
acceptance, characterisation tests from 3.0) must pass with only import
paths changed in tests. Claude installed `dependency-cruiser` (dev).

## Target layout for today's code
| Today | Move to |
|---|---|
| src/main/atomicWrite.ts | src/node-shared/atomicWrite.ts |
| src/main/main.ts | split: src/main/main.ts (entry: wires the parts), src/main/app/window.ts (BrowserWindow creation, navigation guards, ready-to-show), src/main/app/menu.ts, src/main/app/startup.ts (argv/open-file/single-instance/open requests, portable data dir), src/main/ipc/file.ts and src/main/ipc/link.ts (handler registration), src/main/services/file.ts (open/save logic; still in main until 3c) |
| src/shared/api.ts | unchanged path (contracts arrive in 3b) |
| src/renderer/app.ts | src/renderer/main.ts (composition root: creates and wires) + src/renderer/features/editor/editor.ts (CodeMirror setup) + src/renderer/features/preview/preview.ts (preview DOM, link interception) + src/renderer/platform/api.ts (the only file touching window.mdApi) + src/renderer/core/document.ts (current path, dirty state, title — no DOM, no CodeMirror view) |
| src/renderer/render.ts | src/renderer/workers/render/render.ts |
| src/renderer/render.worker.ts | src/renderer/workers/render/render.worker.ts |
| worker message types | src/shared/workers/render.ts |
| src/renderer/renderScheduler.ts | src/renderer/features/preview/renderScheduler.ts |
| src/renderer/sanitize.ts | src/renderer/features/preview/sanitize.ts |
| src/renderer/styles.css, index.html | unchanged (index.html entry → main.ts) |

Anything added by slice 2b (portable, open requests, licence scripts)
moves to the obvious place in the same table (startup.ts for main-side
logic). Keep each moved file's content identical except imports and the
split boundaries; no renames of functions, no refactors "while there".

## Dependency rules
`.dependency-cruiser.cjs` encoding the §3 table exactly (shared imports
nothing; node-shared → shared; main/io-worker → shared, node-shared;
preload → electron, shared/ipc (and shared until 3b); renderer/core →
shared + @codemirror/state; editor → core, shared, @codemirror/*;
features/X → core, editor, ui, platform, shared, solid-js, not another
feature; ui → core, shared, solid-js; platform → core, shared;
renderer/main.ts → anything in renderer; workers → shared, own modules,
markdown-it, highlight.js, @codemirror/state); plus `no-circular`,
`not-to-unresolvable`, dynamic imports included. Renderer may never
import `electron` or `node:*`.
- npm script `check:deps`; `verify` runs it; ci.yml runs it.
- **Planted violations:** `test/fixtures/depcruise/` with one tiny file
  per rule that breaks it (feature→feature, core→@codemirror/view,
  renderer→node:fs, shared→anything, a cycle) and a unit test that runs
  dependency-cruiser's API on each fixture and asserts the rule fires
  (check-red for the rules themselves).
- Coverage config, thresholds and baseline: update paths only (same
  per-file floors on the moved core modules). Protected-change trailer
  will be added by Claude.

## Done means
typecheck, test:unit, build, check:deps exit 0 (paste); `git diff -M
--stat` style list of moves (you cannot run git; list old → new);
confirm no behaviour change: no string literal, channel name or exported
function signature changed except import specifiers.
