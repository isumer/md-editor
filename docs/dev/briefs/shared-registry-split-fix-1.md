# Fix 1: shared-registry-split menu ids

Base: feature/shared-registry-split (continue the PR branch).
Owned files: `src/shared/ipc/menu.ts`, `src/shared/ipc/menu/file.ts`,
`src/main/app/menu/registry.ts`, `docs/dev/registries.md`,
`docs/architecture.md` (the messages paragraph only), menu tests.

Findings from review:
1. `MENU_ITEM_IDS` in `src/shared/ipc/menu.ts` is still a central hard-coded
   list, and `docs/dev/registries.md` tells contributors to edit it. The brief
   requires that a new feature menu item does not edit this file.
   `fileMenu.contributes` is unused.
2. `docs/architecture.md` (about line 212) still names `src/shared/messages/en.ts`.
   The catalog is now composed in `src/renderer/core/messages.ts`.
3. An unrelated Markdown parser change was in `src/renderer/editor/editor.ts` and
   `test/unit/editor.test.ts`. Keep it out of the branch. Keep the strengthened
   `test/unit/tabsDocumentCommands.test.ts`.

Do:
- Make each feature menu declaration the single source of its item ids and
  command ids. Derive `MenuItemId`, `MenuCommandMessage` and the validation
  from the declarations. Shared modules must not gain dependencies
  (`check:deps` stays green). Adding an item then touches only the feature's own file.
- Use `fileMenu.contributes`, or remove it.
- Update `docs/dev/registries.md` and the architecture text.
- The built menu must stay identical: existing snapshot tests stay green.
- `npm run check:acceptance` is red on the perf rows because the CI perf skip
  is on. This does not come from this branch. Do not touch acceptance or thresholds.

Done: typecheck, `check:deps` and unit tests green. Add a test that fails when an
item id is missing from its declaration.
