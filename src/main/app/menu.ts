import { app, Menu, type MenuItemConstructorOptions } from "electron";

import {
  MENU_CHANNELS,
  type MenuCommandMessage,
  type MenuContribution,
  type MenuContributionItem,
  type MenuItemId,
} from "../../shared/ipc/menu";
import { applyWindowAction, getMainWindow } from "./window";

export interface MenuEntry {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
}

export interface ApplicationMenuLike {
  readonly items: readonly MenuEntry[];
  getMenuItemById(id: string): MenuEntry | null;
}

export interface MenuHost {
  buildFromTemplate(template: MenuItemConstructorOptions[]): ApplicationMenuLike;
  setApplicationMenu(menu: ApplicationMenuLike): void;
  getApplicationMenu(): ApplicationMenuLike | null;
}

export type ApplyResult = "rebuilt" | "patched";

export interface MenuController {
  installSkeleton(): void;
  applyContribution(contribution: MenuContribution): ApplyResult;
}

function sendMenuCommand(command: MenuCommandMessage): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(MENU_CHANNELS.command, command);
  }
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

export function buildSkeletonTemplate(
  platform: string,
  appName: string,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  if (platform === "darwin") {
    template.push(macApplicationMenu(appName));
  } else {
    template.push({
      label: "File",
      submenu: [{ role: "quit" }],
    });
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
}

function contributedMenuItem(
  item: MenuContributionItem,
  send: (id: MenuItemId) => void,
): MenuItemConstructorOptions {
  const type = item.id === "view-sync-scroll" || item.id === "view-focus"
    ? "checkbox"
    : item.id === "view-split" || item.id === "view-editor" || item.id === "view-preview"
    ? "radio"
    : "normal";
  return {
    id: item.id,
    label: item.title,
    accelerator: item.accelerator,
    registerAccelerator: false,
    enabled: item.enabled ?? true,
    checked: item.checked ?? false,
    type,
    click: () => send(item.id),
  };
}

function fileMenuIndex(platform: string): number {
  return platform === "darwin" ? 1 : 0;
}

export function buildContributionTemplate(
  platform: string,
  appName: string,
  contribution: MenuContribution,
  send: (id: MenuItemId) => void,
): MenuItemConstructorOptions[] {
  const template = buildSkeletonTemplate(platform, appName);
  const items = contribution.items.map((item) => contributedMenuItem(item, send));
  if (platform === "darwin") {
    template.splice(fileMenuIndex(platform), 0, {
      label: contribution.fileMenuTitle,
      submenu: items,
    });
  } else {
    const fileMenu = template[fileMenuIndex(platform)];
    if (fileMenu) {
      fileMenu.label = contribution.fileMenuTitle;
      fileMenu.submenu = items.length > 0
        ? [...items, { type: "separator" }, { role: "quit" }]
        : [{ role: "quit" }];
    }
  }
  if (contribution.viewMenuTitle !== undefined && contribution.viewItems !== undefined) {
    const viewItems = contribution.viewItems.map((item) => contributedMenuItem(item, send));
    const windowIndex = template.findIndex((item) => item.role === "windowMenu");
    template.splice(windowIndex, 0, {
      label: contribution.viewMenuTitle,
      submenu: viewItems,
    });
  }
  return template;
}

export function patchContribution(
  menu: ApplicationMenuLike | null,
  contribution: MenuContribution,
  platform: string,
): void {
  if (menu === null) {
    return;
  }
  const fileMenu = menu.items[fileMenuIndex(platform)];
  if (fileMenu) {
    fileMenu.label = contribution.fileMenuTitle;
  }
  for (const item of contribution.items) {
    const entry = menu.getMenuItemById(item.id);
    if (entry) {
      entry.label = item.title;
      entry.enabled = item.enabled ?? true;
      entry.checked = item.checked ?? false;
    }
  }
  for (const item of contribution.viewItems ?? []) {
    const entry = menu.getMenuItemById(item.id);
    if (entry) {
      entry.label = item.title;
      entry.enabled = item.enabled ?? true;
      entry.checked = item.checked ?? false;
    }
  }
}

function sameStructure(
  left: MenuContribution,
  right: MenuContribution,
): boolean {
  return left.items.length === right.items.length &&
    left.items.every((item, index) => right.items[index]?.id === item.id) &&
    (left.viewItems?.length ?? 0) === (right.viewItems?.length ?? 0) &&
    (left.viewItems ?? []).every((item, index) => right.viewItems?.[index]?.id === item.id);
}

export function createMenuController(
  platform: string,
  appName: string,
  host: MenuHost,
  send: (id: MenuItemId) => void,
): MenuController {
  let applied: MenuContribution | null = null;

  return {
    installSkeleton() {
      applied = null;
      host.setApplicationMenu(host.buildFromTemplate(
        buildSkeletonTemplate(platform, appName),
      ));
    },
    applyContribution(contribution) {
      const rebuild = applied === null || !sameStructure(applied, contribution);
      applied = contribution;
      if (rebuild) {
        host.setApplicationMenu(host.buildFromTemplate(
          buildContributionTemplate(platform, appName, contribution, send),
        ));
        return "rebuilt";
      }
      patchContribution(host.getApplicationMenu(), contribution, platform);
      return "patched";
    },
  };
}

function electronMenuHost(): MenuHost {
  return {
    buildFromTemplate: (template) =>
      Menu.buildFromTemplate(template) as ApplicationMenuLike,
    setApplicationMenu: (menu) => {
      Menu.setApplicationMenu(menu as Menu);
    },
    getApplicationMenu: () => Menu.getApplicationMenu() as ApplicationMenuLike | null,
  };
}

let menuController: MenuController | null = null;

export function createMenu(): void {
  menuController = createMenuController(
    process.platform,
    app.getName(),
    electronMenuHost(),
    sendMenuCommand,
  );
  menuController.installSkeleton();
}

export function applyMenuContribution(contribution: MenuContribution): void {
  if (contribution.windowAction !== undefined) {
    applyWindowAction(contribution.windowAction);
  }
  menuController?.applyContribution(contribution);
}
