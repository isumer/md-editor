import type { MenuItemConstructorOptions } from "electron";

export interface ShellMenuActions {
  checkForUpdates(): void;
}

function macApplicationMenu(appName: string): MenuItemConstructorOptions {
  return {
    label: appName,
    submenu: [
      { role: "about" },
      { type: "separator" },
      // Electron has no Settings role, so this item is part of the main-owned skeleton.
      { label: "Settings", accelerator: "CmdOrCtrl+," },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
}

export const shellMenu = {
  order: 0,
  build(
    platform: string,
    appName: string,
    actions: ShellMenuActions,
  ): readonly MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = [];
    if (platform === "darwin") {
      template.push(macApplicationMenu(appName));
    } else {
      template.push({ label: "File", submenu: [{ role: "quit" }] });
    }
    template.push({
      label: "Edit",
      submenu: [
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    });
    template.push({ role: "windowMenu" }, {
      role: "help",
      submenu: [{
        id: "help-check-updates",
        label: "Check for Updates",
        click: actions.checkForUpdates,
      }],
    });
    return template;
  },
} as const;
