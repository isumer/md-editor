import type { MenuItemConstructorOptions } from "electron";

function macApplicationMenu(appName: string): MenuItemConstructorOptions {
  return {
    label: appName,
    submenu: [
      { role: "about" },
      { type: "separator" },
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
  build(platform: string, appName: string): readonly MenuItemConstructorOptions[] {
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
    template.push({ role: "windowMenu" }, { role: "help" });
    return template;
  },
} as const;
