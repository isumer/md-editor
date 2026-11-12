import { compareMenu } from "../../shared/ipc/menu/compare";
import type { CommandRegistry } from "../core/commands";

export interface SecondaryDocumentCommandsOptions {
  compare(): void;
}

export interface SecondaryDocumentCommands {
  readonly menuItems: typeof compareMenu.items;
  install(registry: CommandRegistry): void;
}

// Compare is not needed on the first screen. This module registers its command
// and menu item after the primary commands are already usable.
export function createSecondaryDocumentCommands(
  options: SecondaryDocumentCommandsOptions,
): SecondaryDocumentCommands {
  return {
    menuItems: compareMenu.items,
    install(registry) {
      registry.register({
        id: "file.compareOpen",
        titleKey: "menu.compareOpen",
        run: options.compare,
      });
    },
  };
}
