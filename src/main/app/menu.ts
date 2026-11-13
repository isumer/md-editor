import { app, Menu, type MenuItemConstructorOptions } from "electron";

import {
  MENU_CHANNELS,
  type MenuCommandMessage,
  type MenuContribution,
  type MenuContributionItem,
  type MenuItemId,
} from "../../shared/ipc/menu";
import { getMainWindow } from "./window";
import { menuItems, shellMenu } from "./menu/registry";
import type { ShellMenuActions } from "./menu/shell";

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

export function buildSkeletonTemplate(
  platform: string,
  appName: string,
  shellActions: ShellMenuActions = { checkForUpdates: () => undefined },
): MenuItemConstructorOptions[] {
  return [...shellMenu.build(platform, appName, shellActions)];
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

function viewMenuIndex(platform: string): number {
  return platform === "darwin" ? 3 : 2;
}

function contributionItems(
  contribution: MenuContribution,
  send: (id: MenuItemId) => void,
  menu: "file" | "view",
): MenuItemConstructorOptions[] {
  return menuItems.flatMap((declaration) => {
    const inMenu = declaration.id.startsWith(`${menu}-`);
    const item = contribution.items.find((candidate) => candidate.id === declaration.id);
    return inMenu && item ? [contributedMenuItem(item, send)] : [];
  });
}

export function buildContributionTemplate(
  platform: string,
  appName: string,
  contribution: MenuContribution,
  send: (id: MenuItemId) => void,
  shellActions: ShellMenuActions = { checkForUpdates: () => undefined },
): MenuItemConstructorOptions[] {
  const template = buildSkeletonTemplate(platform, appName, shellActions);
  const fileItems = contributionItems(contribution, send, "file");
  const viewItems = contributionItems(contribution, send, "view");
  if (platform === "darwin") {
    template.splice(fileMenuIndex(platform), 0, {
      label: contribution.fileMenuTitle,
      submenu: fileItems,
    });
  } else {
    const fileMenu = template[fileMenuIndex(platform)];
    if (fileMenu) {
      fileMenu.label = contribution.fileMenuTitle;
      fileMenu.submenu = fileItems.length > 0
        ? [...fileItems, { type: "separator" }, { role: "quit" }]
      : [{ role: "quit" }];
    }
  }
  template.splice(viewMenuIndex(platform), 0, {
    label: contribution.viewMenuTitle,
    submenu: viewItems,
  });
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
  const viewMenu = menu.items[viewMenuIndex(platform)];
  if (viewMenu) {
    viewMenu.label = contribution.viewMenuTitle;
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
  actions: ShellMenuActions & { send(id: MenuItemId): void },
): MenuController {
  let applied: MenuContribution | null = null;

  return {
    installSkeleton() {
      applied = null;
      host.setApplicationMenu(host.buildFromTemplate(
        buildSkeletonTemplate(platform, appName, actions),
      ));
    },
    applyContribution(contribution) {
      const rebuild = applied === null || !sameStructure(applied, contribution);
      applied = contribution;
      if (rebuild) {
        host.setApplicationMenu(host.buildFromTemplate(
          buildContributionTemplate(
            platform,
            appName,
            contribution,
            actions.send,
            actions,
          ),
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

export function createMenu(checkForUpdates: () => void = () => undefined): void {
  menuController = createMenuController(
    process.platform,
    app.getName(),
    electronMenuHost(),
    { checkForUpdates, send: sendMenuCommand },
  );
  menuController.installSkeleton();
}

export function applyMenuContribution(contribution: MenuContribution): void {
  if (menuController === null) return;
  menuController.applyContribution(contribution);
}
