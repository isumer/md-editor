# Fix 2: move menu composition out of src/shared

Base: feature/shared-registry-split (continue the PR branch).

Owned files: `.dependency-cruiser.cjs`, `src/shared/ipc/menu.ts`,
`src/shared/ipc/menu/` (delete `registry.ts`; keep or adjust `file.ts`,
`compare.ts`; new `compose.ts`), `src/main/app/menu/registry.ts`,
`src/main/app/menu.ts` (imports only), `src/renderer/tabs/documentCommands.ts`,
`test/unit/menu.test.ts`, `test/unit/menuRegistry.test.ts`,
`test/unit/menuContribution.test.ts`, `test/unit/menuIpc.test.ts`,
`test/unit/tabsDocumentCommands.test.ts`, `docs/dev/registries.md`,
`docs/architecture.md` (the menu paragraph only).

## Why earlier rounds did not converge

The branch went through fix-1, two gatefix rounds and one review fix on
1821fec. Each round patched symptoms and kept the same design, so the
finding survived every round:

- The original brief (`docs/dev/briefs/shared-registry-split.md`) Scope 2
  says `src/shared/ipc/menu.ts` builds the menu and the command union from
  the per-feature list. That sentence conflicts with an older invariant:
  files under `src/shared` have zero imports, even type-only
  (`.dependency-cruiser.cjs` `shared-no-dependencies`, review guide §3.2).
  A module that imports the declarations cannot live under `src/shared`.
- Fix-1 asked for both: derive the ids from the declarations, and keep
  `check:deps` green. Under the conflicting design the only way to keep
  `check:deps` green was the exemption. Every later round kept the
  composition in `src/shared` and only adjusted the exemption's shape.
  Narrowing an exemption is not removing a rule violation.
- One round also added unproven perf edits to `src/renderer/editor/editor.ts`
  and `workers/render/incremental.ts` (a fabricated parse tree,
  `FILL_BATCH_SIZE` 8 to 32). The review reverted them. Do not repeat that.

This brief decides the design so the violation is removed, not narrowed.
It supersedes the original brief's Scope 2 sentence quoted above. Scopes 1
(messages) and 3 (renderer wiring) keep the shape that is on the branch;
they passed the gate.

## Finding to fix (Vision's gate on candidate 1821fec)

Major, sections 3.1 and 3.2: `.dependency-cruiser.cjs:20` exempts
`src/shared/ipc/menu.ts` and `src/shared/ipc/menu/registry.ts` from
`shared-no-dependencies`, and adds a `shared-menu-imports-shared-only`
rule. Both files import project files. The gate restored the original
rule and `check:deps` reported three violations. The rule must not be
loosened.

## Target design

1. `.dependency-cruiser.cjs`: restore exactly main's shape. Remove the
   `pathNot` from `shared-no-dependencies` and delete the
   `shared-menu-imports-shared-only` rule. No exemption may stay.
2. `src/shared/ipc/menu.ts`: zero imports. Keep `MENU_CHANNELS`, the
   contract interfaces, the validation and `MenuCommandMessage`. Restore
   the literal `MENU_ITEM_IDS` as the single source of the `MenuItemId`
   and `MenuCommandId` unions, listing exactly the ids and command ids
   the branch composes today. Remove the `MENU_ITEMS` value list and the
   `./menu/registry` import from this file.
3. `src/shared/ipc/menu/file.ts` and `compare.ts`: keep as self-contained
   `as const` data modules with zero imports. They stay the single source
   of each feature's titles, accelerators, order and command ids.
4. `src/shared/ipc/menu/compose.ts`: new, zero imports, pure. Export one
   function that takes the declaration modules and returns the item list
   sorted by `order` (equal order keeps import order). One implementation
   of the ordering rule.
5. Delete `src/shared/ipc/menu/registry.ts`. `src/main/app/menu/registry.ts`
   becomes a real main-owned module: it imports each declaration file
   directly and composes the ordered list through `compose.ts`.
   `src/main/app/menu.ts` keeps building the template from it.
6. `src/renderer/tabs/documentCommands.ts` imports the declaration files
   and `compose.ts` directly (renderer to shared is legal) and builds the
   contribution list the same way. Do not import anything from `src/main`.
7. The built menu, the contribution payload, the command union and the
   validation must stay byte-identical to what the branch produces today:
   same ids, labels, roles, accelerators and order.

## Tests (red evidence first)

1. First step: restore `.dependency-cruiser.cjs` (item 1) before moving
   code, run `npm run check:deps`, and record the three violations in the
   PR report. That is the red evidence that the exemption was load-bearing.
2. Add a test that fails when an item id or command id drifts between the
   declarations and the literal unions in `src/shared/ipc/menu.ts`
   (remove one id from `MENU_ITEM_IDS`: the test goes red).
3. Add a test that the list main composes equals the list the renderer
   composes (ids, order, title keys, accelerators). Removing either
   feature's declaration import goes red.
4. Keep every existing menu and messages test green: the snapshot in
   `test/unit/menu.test.ts` and the exact File-menu contribution in
   `test/unit/tabsDocumentCommands.test.ts` are the identity proofs.
5. Mutation proof in the report: drop the `compareMenu` import from
   `src/main/app/menu/registry.ts`; the registry or snapshot test must go
   red. Change a declaration's `order`; the order test must go red.
   Restore both.

## Guardrails

- Do not touch `src/renderer/editor/editor.ts`,
  `src/renderer/workers/render/**`, `src/shared/messages/**`,
  `src/renderer/core/messages.ts`, `src/renderer/features/list.ts` or
  `src/renderer/editor/featureWiring.ts`: those passed the gate.
- Do not touch acceptance files, coverage baselines, thresholds or
  workflows. The host-red `check:acceptance` perf rows and the Pi
  `editor.test.ts` timeouts are known host rows; leave them.
- `npm run check:acceptance` may stay red only on the `@AC-PERF` rows the
  Pi run excludes; every other row keeps its state.

## Done means

- `npm run typecheck`, `npm run check:deps` (zero exemptions) and the
  unit suite green. Run the menu and tabs unit tests targeted; CI runs
  the full set.
- `docs/dev/registries.md` and the `docs/architecture.md` menu paragraph
  describe the new layout: declarations in `src/shared/ipc/menu/`,
  composition in the processes, id unions literal in the shared contract.
- PR report lists the red evidence from item 1, the mutation results from
  item 5, and confirms ids, labels, accelerators and order unchanged.
