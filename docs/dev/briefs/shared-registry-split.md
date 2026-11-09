# Split the shared registries so features stop colliding (dev lane)

Base: main

Almost every feature PR edits the same files to add one entry:
`src/shared/messages/en.ts`, `src/main/app/menu.ts`,
`src/shared/ipc/menu.ts` and `src/renderer/main.ts`. Each merge then
conflicts with every open PR and costs a sync round. This is a
behaviour-preserving refactor that gives each feature its own entry
file.

## Scope
1. Messages: one module per feature or area (for example
   `src/shared/messages/en/compare.ts`) exporting its keys and English
   strings. `en.ts` only composes them; `MessageKey` stays one type
   derived from the composed modules, so a missing or duplicate key is a
   compile error.
2. Menus: each feature declares its menu items and their IPC command
   ids in its own module; `src/main/app/menu.ts` and
   `src/shared/ipc/menu.ts` build the menu and the command union from
   the list. Menu order, labels, accelerators and roles stay exactly as
   they are today.
3. Renderer wiring: features register through one list module instead
   of each adding lines to `src/renderer/main.ts`.
4. Adding a feature's message, menu item or wiring afterwards touches
   only the feature's own files plus one import line in the list.
5. No behaviour change, no new dependency, no test budget change.

## Invariants (check before and after)
- The built menu is identical: add a unit test that snapshots the menu
  template (labels, accelerators, roles, order, command ids) and passes
  on main before the refactor.
- Every message key resolves to the same string (unit test over the
  composed table).
- The IPC command union accepts and rejects the same ids
  (`ipc-contracts` e2e unchanged and green).

## Done means
- `npm run verify` passes (the full e2e set: this change touches shared
  files).
- `docs/dev/` notes where a new feature adds its messages, menu items
  and wiring.
- PR text lists the new files and confirms the three invariants.
