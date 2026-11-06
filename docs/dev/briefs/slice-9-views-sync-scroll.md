review: deep

# Slice 9 — View modes and sync scroll (R2, R3)

Base: main

Branch `feature/slice-9-views-sync-scroll`. Follow AGENTS.md. Implement the
planned criteria in `docs/acceptance/R02-view-modes.md` (AC-R2-01 … 07) and
`docs/acceptance/R03-sync-scroll.md` (AC-R3-01 … 05); mark each
`implemented` only with its test. No new dependencies.

## What
- **View modes:** split / editor only / preview only, a draggable divider
  that resets on double-click, OS full screen, focus mode. Commands and menu
  items for each, with the keys the criteria name.
- **Sync scroll:** a toggle; editor → preview and preview → editor by
  source line, using the line positions the render worker already emits
  (extend the render output only if it lacks them). A scroll caused by sync
  never triggers the reverse sync (AC-R3-03). Use the heading-map fixture
  under `test/fixtures/views/` for exact positions.
- **Performance:** resize, mode switch and sync scroll on the 20 MB
  document keep the PERF budgets; no layout read inside a scroll handler
  loop, at most one sync per animation frame.

## Allowed files
New: `src/renderer/features/views/**`, `src/renderer/features/sync-scroll/**`,
their tests (`test/unit/views*.test.ts`, `test/unit/syncScroll*.test.ts`,
`test/e2e/views.spec.ts`, `test/e2e/sync-scroll.spec.ts`).
Existing, kept to the minimum needed to mount and register: `src/renderer/main.ts`,
`src/renderer/styles.css`, `src/renderer/index.html`,
`src/renderer/core/commands.ts`, `src/renderer/core/keymap.ts`,
`src/renderer/core/contextKeys.ts`, `src/main/app/menu.ts`,
`src/main/app/menuContribution.ts`, `src/main/app/window.ts` (full screen),
`src/renderer/features/preview/preview.ts` (scroll hooks only),
`src/renderer/workers/render/*` (line positions only), `src/shared` message files.
Do not touch export, io-worker, `src/main/io`, tabs or the sidebar/tree
(other lanes work there). If the work needs a change elsewhere, stop and
name it.

## Checks before you finish
`npm run verify` green on Linux, including the PERF e2e legs.
