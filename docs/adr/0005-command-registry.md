# 0005 — Every action is a registered command
Status: accepted (2026-11-04, after two review rounds)

**Context.** ~100 actions reachable from menus, shortcuts, palette,
context menus, toolbars, macros and tests; per-surface handlers drift.

**Options.** Ad-hoc handlers per surface · a command registry with ids.

**Decision.**
- Registry in `renderer/core`: `{ id, titleKey, when?, run(ctx, args, target) }`;
  `target` names what was clicked (tab, view, tree node); features
  contribute context keys evaluated by `when`.
- All surfaces invoke by id; the keymap is data; macros record command
  invocations, typing as `editor.insertText(text)` relative to the
  selection; long playback runs in cancellable batches.
- **Menus:** main owns a static skeleton that works with no renderer
  (macOS app menu, File > Quit, Window, Help); the renderer contributes
  items and state, coalesced (≤ 1 push / 100 ms, < 2 ms in main), patched
  in place, rebuilt only on structural change.
- **Keys:** the renderer keymap owns every chord, including **Undo and
  Redo**, so macros record them and all platforms behave alike; menu
  items show chords with `registerAccelerator: false`. Native roles are
  kept only for Cut, Copy, Paste, Select All, and the macOS IME/Services
  and app-menu items (⌘Q/⌘H/⌘M). Matching by `event.key`; on Windows a
  `Ctrl+Alt+<key>` that produces a character (AltGr) is text input, and
  default bindings avoid Ctrl+Alt chords.
- macOS `open-file` events are handled alongside argv.

**Consequences.** One indirection per action; palette, rebinding,
macros, enablement and e2e-by-id come with it. Test: Cmd/Ctrl+Z inside a
recorded macro replays.

**Reverse if** never expected — this is the backbone of the feature set.
