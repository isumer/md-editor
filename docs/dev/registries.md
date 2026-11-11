# Shared registries

Add English messages to one area file under `src/shared/messages/en/`.

Export the area once from `src/renderer/core/messages/registry.ts`.

The renderer composer rejects duplicate keys during type checking.

English message declaration files must not import another project file.

Add menu declarations to one feature file under `src/shared/ipc/menu/`.

Declare each item ID and command ID in that feature file.

Add the same IDs to the literal unions in `src/shared/ipc/menu.ts`.

Each process composes the ordered list itself through `src/shared/ipc/menu/compose.ts`.

The main registry (`src/main/app/menu/registry.ts`) imports every declaration file.

The renderer composes the same list in `src/renderer/tabs/documentCommands.ts`.

A unit test fails when the two composed lists differ.

Shared menu files must not import another project file.

Add main-owned menu sections under `src/main/app/menu/`.

Export the section once from `src/main/app/menu/registry.ts`.

Add renderer wiring inside the feature folder.

Export the wiring once from `src/renderer/features/list.ts`.

Do not add feature imports to `src/renderer/main.ts`.
