import { Menu, type MenuItemConstructorOptions } from "electron";

import { MENU_CHANNELS, type MenuCommand } from "../../shared/ipc/menu";
import { getMainWindow } from "./window";

function sendMenuCommand(command: MenuCommand): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(MENU_CHANNELS.command, command);
  }
}

export function createMenu(): void {
  const template: MenuItemConstructorOptions[] = [{
    label: "File",
    submenu: [
      {
        id: "file-open",
        label: "Open",
        accelerator: "CmdOrCtrl+O",
        click: () => sendMenuCommand("open"),
      },
      {
        id: "file-save",
        label: "Save",
        accelerator: "CmdOrCtrl+S",
        click: () => sendMenuCommand("save"),
      },
      {
        id: "file-save-as",
        label: "Save As",
        accelerator: "CmdOrCtrl+Shift+S",
        click: () => sendMenuCommand("saveAs"),
      },
      { type: "separator" },
      { role: "quit", label: "Quit" },
    ],
  }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
