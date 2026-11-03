# 0005 — Every action is a registered command
Status: proposed, revised (2026-11-04)

**Context.** ~100 actions reachable from menus, shortcuts, a palette,
context menus, toolbars, macros and tests. If each surface wires its own
handler they drift (a shortcut that does not match its menu item, a macro
that cannot replay an action).

**Options.** Ad-hoc handlers per surface · a command registry with ids.

**Decision.** A registry in `renderer/core`: `{ id, title, when, run }`.
All surfaces invoke by id; the keymap is data; macros record command ids
and editor transactions; native menus are built from a menu model of ids.

**Consequences.** A small indirection for every action; enables the
palette, rebinding, macros, enablement (`when`) and e2e-by-id for free.

**Reverse if** never expected — this is the backbone of the Notepad++
feature set.

**Amendment (review finding 7).** Main owns a static menu skeleton that
works without a renderer; the renderer contributes items and state,
coalesced (≤ 1 push / 100 ms, < 2 ms in main), patched in place. The
renderer keymap owns all chords (`registerAccelerator: false`) except
OS-native roles; AltGr chords are text input. Commands take a `target`;
features contribute context keys. macOS `open-file` is handled. Titles
are message keys.
