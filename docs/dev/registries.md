# Shared registries

Add English messages to one area file under `src/shared/messages/en/`.

Export the area once from `src/renderer/core/messages/registry.ts`.

The renderer composer rejects duplicate keys during type checking.

English message declaration files must not import another project file.

Add menu declarations to one feature file under `src/shared/ipc/menu/`.

Declare each item ID and command ID in that feature file.

Export the feature once from `src/shared/ipc/menu/registry.ts`.

The main registry re-exports that list with its main-owned menu sections.

The shared registry composes each item ID and command ID.

The shared menu types and validators derive IDs from that composition.

Shared menu declarations must not import another project file.

Add main-owned menu sections under `src/main/app/menu/`.

Export the section once from `src/main/app/menu/registry.ts`.

Add renderer wiring inside the feature folder.

Export the wiring once from `src/renderer/features/list.ts`.

Do not add feature imports to `src/renderer/main.ts`.
