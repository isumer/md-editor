# 0005 — Every action is a registered command
Status: proposed (2026-11-04)

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
