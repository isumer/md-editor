# Shared registries

Add English messages to one area file under `src/shared/messages/en/`.

Export the area once from `src/renderer/core/messages/registry.ts`.

The renderer composer rejects duplicate keys during type checking.

Shared files must not import another project file.

Add menu declarations to one feature file under `src/shared/ipc/menu/`.

Declare each item ID and command ID in that feature file.

Add the feature once to `src/main/app/menu/registry.ts`.

The registry composes each item ID and command ID from those declarations.

The shared menu types and validators derive IDs from that composition.

Shared menu declarations must not import another project file.

Add main-owned menu sections under `src/main/app/menu/`.

Export the section once from `src/main/app/menu/registry.ts`.

Add renderer wiring inside the feature folder.

Export the wiring once from `src/renderer/features/list.ts`.

Do not add feature imports to `src/renderer/main.ts`.
