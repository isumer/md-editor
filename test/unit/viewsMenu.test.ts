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

import { installViewMenu } from "../../src/main/app/menu";
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
