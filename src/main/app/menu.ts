import { app, Menu, type MenuItemConstructorOptions } from "electron";

import {
  MENU_CHANNELS,
  type MenuCommandMessage,
  type MenuContribution,
  type MenuContributionItem,
  type MenuItemId,
  type ViewMenuItemId,
} from "../../shared/ipc/menu";
import { getMainWindow } from "./window";
import { shellMenu } from "./menu/registry";

export interface MenuEntry {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
}

export interface ApplicationMenuLike {
  readonly items: readonly MenuEntry[];
  getMenuItemById(id: string): MenuEntry | null;
  insert?(position: number, item: unknown): void;
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

function viewCommandItem(
  id: ViewMenuItemId,
  label: string,
  accelerator: string,
): MenuItemConstructorOptions {
  return {
    id,
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendMenuCommand(id),
  };
}

function toggleFullScreen(): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
}

function viewMenu(platform: string): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      viewCommandItem("view-split", "Split View", "CmdOrCtrl+1"),
      viewCommandItem("view-editor", "Editor Only", "CmdOrCtrl+2"),
      viewCommandItem("view-preview", "Preview Only", "CmdOrCtrl+3"),
      { type: "separator" },
      {
        id: "view-full-screen",
        label: "Full Screen",
        accelerator: platform === "darwin" ? "Ctrl+Command+F" : "F11",
        click: toggleFullScreen,
      },
    ],
  };
}

export function installViewMenu(platform: string): void {
  const menu = Menu.getApplicationMenu() as ApplicationMenuLike | null;
  if (menu === null || menu.getMenuItemById("view-split") !== null || !menu.insert) return;
  const item = Menu.buildFromTemplate([viewMenu(platform)]).items[0];
  if (item !== undefined) menu.insert(Math.max(0, menu.items.length - 2), item);
}

export function buildSkeletonTemplate(
  platform: string,
  appName: string,
): MenuItemConstructorOptions[] {
  return [...shellMenu.build(platform, appName)];
}

function contributedMenuItem(
  item: MenuContributionItem,
  send: (id: MenuItemId) => void,
): MenuItemConstructorOptions {
  return {
    id: item.id,
    label: item.title,
    accelerator: item.accelerator,
    registerAccelerator: false,
    enabled: item.enabled ?? true,
    checked: item.checked ?? false,
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
    return template;
  }
  const fileMenu = template[fileMenuIndex(platform)];
  if (fileMenu) {
    fileMenu.label = contribution.fileMenuTitle;
    fileMenu.submenu = items.length > 0
      ? [...items, { type: "separator" }, { role: "quit" }]
      : [{ role: "quit" }];
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
}

function sameStructure(
  left: MenuContribution,
  right: MenuContribution,
): boolean {
  return left.items.length === right.items.length &&
    left.items.every((item, index) => right.items[index]?.id === item.id);
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
  if (menuController === null) return;
  menuController.applyContribution(contribution);
  installViewMenu(process.platform);
}
