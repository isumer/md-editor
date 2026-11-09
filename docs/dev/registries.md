# Shared registries

Add English messages to one area file under `src/shared/messages/en/`.

Export the area once from `src/shared/messages/en/registry.ts`.

The composer rejects duplicate keys during type checking.

Add menu declarations to one feature file under `src/shared/ipc/menu/`.

Export the feature once from `src/shared/ipc/menu/registry.ts`.

Add main-owned menu sections under `src/main/app/menu/`.

Export the section once from `src/main/app/menu/registry.ts`.

Add renderer wiring inside the feature folder.

Export the wiring once from `src/renderer/features/list.ts`.

Do not add feature imports to `src/renderer/main.ts`.
