export const MENU_CHANNELS = {
  command: "menu:command",
} as const;

export type MenuCommand = "open" | "save" | "saveAs";
export type MenuCommandMessage = MenuCommand;

export function isMenuCommand(value: unknown): value is MenuCommand {
  return value === "open" || value === "save" || value === "saveAs";
}
