import { compareMenu } from "../../shared/ipc/menu/compare";
import { composeMenuItems } from "../../shared/ipc/menu/compose";
import { mergeMenu } from "../../shared/ipc/menu/merge";
import type { CommandRegistry } from "../core/commands";

const menuItems = composeMenuItems([compareMenu, mergeMenu]);

export interface SecondaryDocumentCommandsOptions {
  compare(): void;
  merge(): void;
}

export interface SecondaryDocumentCommands {
  readonly menuItems: typeof menuItems;
  install(registry: CommandRegistry): void;
}

export function createSecondaryDocumentCommands(
  options: SecondaryDocumentCommandsOptions,
): SecondaryDocumentCommands {
  return {
    menuItems,
    install(registry) {
      registry.register({
        id: "file.compareOpen",
        titleKey: "menu.compareOpen",
        run: options.compare,
      });
      registry.register({
        id: "file.mergeOpen",
        titleKey: "menu.mergeOpen",
        run: options.merge,
      });
    },
  };
}
