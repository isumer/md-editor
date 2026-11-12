import { beforeEach, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: { getName: () => "SolidMD" },
  Menu: {
    buildFromTemplate: vi.fn((template: unknown[]) => ({ items: template })),
    getApplicationMenu: vi.fn(),
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock("electron", () => electron);

import { applyMenuContribution, installViewMenu } from "../../src/main/app/menu";
import { MENU_CHANNELS } from "../../src/shared/ipc/menu";
import { setMainWindow } from "../../src/main/app/window";

beforeEach(() => vi.clearAllMocks());

it("AC-R2-03: the full-screen item toggles the native window state", () => {
  const insert = vi.fn();
  electron.Menu.getApplicationMenu.mockReturnValue({
    getMenuItemById: () => null,
    insert,
    items: [{}, {}, {}],
  });
  const setFullScreen = vi.fn();
  setMainWindow({
    isDestroyed: () => false,
    isFullScreen: () => false,
    setFullScreen,
  } as unknown as Parameters<typeof setMainWindow>[0]);

  installViewMenu("linux");
  const view = electron.Menu.buildFromTemplate.mock.calls[0]?.[0][0] as {
    submenu: Array<{ id?: string; click?: () => void }>;
  };
  view.submenu.find((item) => item.id === "view-full-screen")?.click?.();

  expect(setFullScreen).toHaveBeenCalledWith(true);
  expect(insert).toHaveBeenCalledOnce();
});

it("AC-R2-08: installs pane modes in View without a toolbar command", () => {
  const insert = vi.fn();
  electron.Menu.getApplicationMenu.mockReturnValue({
    getMenuItemById: () => null,
    insert,
    items: [{}, {}, {}],
  });

  installViewMenu("darwin");
  const view = electron.Menu.buildFromTemplate.mock.calls[0]?.[0][0] as {
    label: string;
    submenu: Array<{ id?: string; accelerator?: string }>;
  };

  expect(view.label).toBe("View");
  expect(view.submenu.map((item) => item.id).filter(Boolean)).toEqual([
    "view-split",
    "view-editor",
    "view-preview",
    "view-full-screen",
  ]);
  expect(view.submenu.find((item) => item.id === "view-full-screen")?.accelerator)
    .toBe("Ctrl+Command+F");
});

it("does not duplicate or install a View menu without a mutable menu", () => {
  electron.Menu.getApplicationMenu.mockReturnValueOnce(null);
  installViewMenu("linux");
  electron.Menu.getApplicationMenu.mockReturnValueOnce({
    getMenuItemById: () => ({ id: "view-split" }),
    insert: vi.fn(),
    items: [],
  });
  installViewMenu("linux");
  electron.Menu.getApplicationMenu.mockReturnValueOnce({
    getMenuItemById: () => null,
    items: [],
  });
  installViewMenu("linux");

  expect(electron.Menu.buildFromTemplate).not.toHaveBeenCalled();
});

type ViewTemplate = {
  submenu: Array<{ id?: string; click?: () => void }>;
};

function builtViewSubmenu(): ViewTemplate {
  const view = electron.Menu.buildFromTemplate.mock.calls[0]?.[0][0] as ViewTemplate | undefined;
  if (view === undefined) throw new Error("Missing built View template");
  return view;
}

function clickViewItem(id: string): void {
  const item = builtViewSubmenu().submenu.find((entry) => entry.id === id);
  if (item?.click === undefined) throw new Error(`Missing menu item ${id}`);
  item.click();
}

it("view items send their command to the main window", () => {
  electron.Menu.getApplicationMenu.mockReturnValue({
    getMenuItemById: () => null,
    insert: vi.fn(),
    items: [{}, {}, {}],
  });
  const send = vi.fn();
  setMainWindow({
    isDestroyed: () => false,
    webContents: { send },
  } as unknown as Parameters<typeof setMainWindow>[0]);

  installViewMenu("linux");
  clickViewItem("view-split");
  clickViewItem("view-editor");
  clickViewItem("view-preview");

  expect(send.mock.calls).toEqual([
    [MENU_CHANNELS.command, "view-split"],
    [MENU_CHANNELS.command, "view-editor"],
    [MENU_CHANNELS.command, "view-preview"],
  ]);
  setMainWindow(null);
});

it("full-screen does nothing without a live window", () => {
  electron.Menu.getApplicationMenu.mockReturnValue({
    getMenuItemById: () => null,
    insert: vi.fn(),
    items: [{}, {}, {}],
  });
  installViewMenu("linux");
  const item = builtViewSubmenu().submenu.find((entry) => entry.id === "view-full-screen");
  if (item?.click === undefined) throw new Error("Missing full-screen item");

  setMainWindow(null);
  expect(() => item.click?.()).not.toThrow();

  const setFullScreen = vi.fn();
  setMainWindow({
    isDestroyed: () => true,
    isFullScreen: () => false,
    setFullScreen,
  } as unknown as Parameters<typeof setMainWindow>[0]);
  item.click?.();
  expect(setFullScreen).not.toHaveBeenCalled();
});

it("applyMenuContribution without a controller does not install the View menu", () => {
  electron.Menu.getApplicationMenu.mockReturnValue({
    getMenuItemById: () => null,
    insert: vi.fn(),
    items: [{}, {}, {}],
  });

  expect(() => applyMenuContribution({
    fileMenuTitle: "File",
    items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }],
  })).not.toThrow();

  expect(electron.Menu.buildFromTemplate).not.toHaveBeenCalled();
  expect(electron.Menu.setApplicationMenu).not.toHaveBeenCalled();
});

it("installs nothing when the built View menu item is missing", () => {
  const insert = vi.fn();
  electron.Menu.getApplicationMenu.mockReturnValueOnce({
    getMenuItemById: () => null,
    insert,
    items: [{}, {}, {}],
  });
  electron.Menu.buildFromTemplate.mockReturnValueOnce({ items: [] });

  installViewMenu("linux");

  expect(insert).not.toHaveBeenCalled();
});
