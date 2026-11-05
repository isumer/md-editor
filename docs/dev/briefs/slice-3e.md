# Slice 3e — commands, keymap, menu skeleton, message keys (ADR-0005)

review: opus

**Builds on the slice under review, `auto/013-3d-2-doc-asset-1105-0830`**
(plus `main`). It touches different files; work on top of it. Today every
action is an ad-hoc handler: main's menu sends three hardcoded `MenuCommand`
strings over `menu:command`, the renderer `if/else`s them in `main.ts`, and
Undo/Redo are whatever CodeMirror's `basicSetup` keymap happens to bind.
This slice replaces all of that with a registered-command backbone, so the
later slices (macros, palette, rebinding, enablement, e2e-by-id) have one
place to hook.

Read AGENTS.md, docs/architecture.md §3, §5, ADR-0005, ADR-0007, then
`src/main/app/menu.ts`, `src/main/ipc/handle.ts` (sender-frame and URL
checks), `src/main/app/startup.ts`, `src/shared/ipc/menu.ts`,
`src/shared/ipc/result.ts`, `src/shared/messages/en.ts`,
`src/preload/preload.ts`, `src/renderer/main.ts`,
`src/renderer/editor/editor.ts`, and the e2e helpers. No new dependencies.
You cannot run Electron: write e2e tests, make typecheck pass, name the e2e
tests you could not run.

## Goal
Every action is a command `{ id, titleKey, when?, run(ctx, args, target) }`
in a renderer-core registry; features contribute context keys that `when`
evaluates. The renderer keymap owns every chord (Undo/Redo included); the
menu is a main-owned skeleton whose File action items and state are
contributed by the renderer and patched in place, and every user-visible
title is a message key in the catalog.

## Command registry + context keys (`src/renderer/core/commands.ts`,
`src/renderer/core/contextKeys.ts`, new files)
- A registry keyed by string id; `run(ctx, args, target)` where `target`
  names what was clicked (tab, view, tree node — for now a placeholder the
  menu/keymap pass as `undefined` or `"menu"`). Register the commands that
  exist today as commands: `file.open`, `file.save`, `file.saveAs`,
  `undo`, `redo`. Each has a `titleKey` from the catalog.
- A context-key service: `get/set/subscribe` over a flat string set, and a
  pure `evaluateWhen(when, keys)` (supports `!`, `&&`, `||`, parentheses,
  and bare key names). Contribute the keys that exist today: `editorFocus`
  and `hasSelection` (sidebar/compare/languageId arrive in later slices).
  `when` on a command gates `run` unless the current keys satisfy it.
- `undo`/`redo` dispatch to CodeMirror's `undo`/`redo` commands on the
  editor. CodeMirror's own undo/redo keybindings must be removed from
  `basicSetup` so the keymap below is the only thing that fires them (no
  double undo). Keep `history()` itself.

## Keymap (`src/renderer/core/keymap.ts`, new file)
- Data: `{ chord: commandId }` bindings, at least `Mod-o`→`file.open`,
  `Mod-s`→`file.save`, `Mod-Shift-s`→`file.saveAs`, `Mod-z`→`undo`,
  `Mod-Shift-z` and `Mod-y`→`redo`. `Mod` maps to `Ctrl` on Windows/Linux
  and `Meta` on macOS.
- A `keydown` listener (capture) that normalises `event.key` +
  `ctrl/meta/shift/alt` into a chord, matches it, and runs the command,
  `preventDefault`ing so native accelerators (now off) and CodeMirror do
  not also handle it. On Windows, a `Ctrl+Alt+<key>` that produces a
  character (AltGr) is text input and never a command; the default bindings
  avoid Ctrl+Alt chords for this reason.

## Menu (`src/main/app/menu.ts`, `src/shared/ipc/menu.ts`,
`src/main/ipc/handle.ts`, `src/preload/preload.ts`)
- Main owns only the static skeleton that works with no renderer: macOS
  app menu (About, Settings ⌘,, Services, Hide, Quit — roles, so the OS
  supplies labels), File > Quit on other platforms, Edit roles (Cut, Copy,
  Paste, Select All), Window and Help roles. The File action items (Open,
  Save, Save As) are NOT in the skeleton.
- The renderer contributes the File action items and their state over a new
  renderer→main channel in `src/shared/ipc/menu.ts` (typed contract with
  exact-shape validators, ADR-0007): each item `{ id, title, accelerator,
  enabled?, checked? }` with `title` already resolved from its `titleKey`
  (English-only v1; main stays catalog-free). The main handler checks the
  sender frame and URL exactly (as `ipc/handle.ts` does today) and
  validates the payload before use.
- Main applies a contribution by patching the application menu in place:
  existing items are updated (`enabled`/`checked`/`label`), and the menu is
  rebuilt from a template only when structure changes (an item added or
  removed). Pushes are coalesced to at most one application per 100 ms; a
  patch costs < 2 ms in main. Menu items show chords with
  `registerAccelerator: false` — the renderer keymap runs them.
- The renderer signals its initial contribution (and later state changes)
  once it has wired its commands; until then the File action items are
  absent. `startup.ts` keeps the existing ready handshake.

## Message keys (`src/shared/messages/en.ts`)
- Command titles move into the catalog under a `menu`/`command` section
  (`menu.open`, `menu.save`, `menu.saveAs`, and the File menu's own title
  if it is not a role). `main.ts`'s `if/else` on `MenuCommand` is replaced
  by a lookup that runs the command by id.

## Tests (each red against pre-change code)
- [AC-R1-08] e2e: type, press `Mod+z` → text reverts, press `Mod+Shift+z`
  (and `Mod+y` on Windows) → text returns; preview and dirty marker follow.
  Unit: the keymap data maps `Mod-z`/`Mod-Shift-z`/`Mod-y` to `undo`/`redo`.
- [AC-R5-20] e2e: `Mod+o` opens the dialog, `Mod+s` writes, `Mod+Shift+s`
  opens Save As — same observable as `clickMenuItem("file-open", …)` etc.;
  the menu items report `registerAccelerator: false` with the displayed
  chords (`application.evaluate` on the Menu). Unit: keymap data maps the
  three chords to `file.open`/`file.save`/`file.saveAs`.
- [AC-R5-21] e2e: before the renderer contributes, File > Open/Save/Save
  As are absent (skeleton only); after, they are present with ids
  `file-open`/`file-save`/`file-save-as`, catalog titles and displayed
  chords. Unit: the patch-in-place function updates `enabled`/`checked`
  without rebuilding, and rebuilding happens only when an item is
  added/removed; the `menu:contribute` contract accepts exactly the valid
  shapes and rejects hostile ones (unknown id, wrong types, prototype
  keys); the main handler refuses a sender that is not the top frame or
  whose URL is not the app URL.
- [AC-PERF-06] unit: a burst of N state pushes reaches the patch function
  at most once per 100 ms window, and the patch function itself runs in
  under 2 ms (measure with `performance.now` around a representative patch,
  not a wall-clock sleep).
- Unit: `evaluateWhen` table (`a`, `!a`, `a && b`, `a || b`, parens,
  unknown key) → exact outcome; a command with an unsatisfied `when` does
  not run; a command with no `when` runs. Unit: AltGr (Ctrl+Alt) character
  chords are never matched as commands.
- All existing unit and e2e tests pass (update paths only).

## Allowed files
src/renderer/**, src/main/**, src/shared/**, src/preload/**,
test/unit/**, test/e2e/**. Nothing else — no acceptance docs, PLAN,
architecture, ADRs, coverage config, workflows, package.json.

## Done means
typecheck, check:deps, test:unit, check:coverage, build exit 0 — paste;
list files; red evidence per new test; name the e2e tests you could not
run.
