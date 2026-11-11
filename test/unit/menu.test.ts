import type { MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMenuContribution,
  MENU_CHANNELS,
  type MenuContribution,
} from "../../src/shared/ipc/menu";

const electron = vi.hoisted(() => {
  interface TemplateItem {
    id?: string;
    label?: string;
    role?: string;
    type?: string;
    enabled?: boolean;
    checked?: boolean;
    accelerator?: string;
    registerAccelerator?: boolean;
    click?: () => void;
    submenu?: TemplateItem[];
  }

  class FakeItem {
    id: string;
    label: string;
    enabled: boolean;
    checked: boolean;
    role: string | undefined;
    type: string | undefined;
    accelerator: string | undefined;
    registerAccelerator: boolean | undefined;
    click: (() => void) | undefined;
    submenu: FakeMenu | undefined;

    constructor(options: TemplateItem) {
      this.id = options.id ?? "";
      this.label = options.label ?? "";
      this.enabled = options.enabled ?? true;
      this.checked = options.checked ?? false;
      this.role = options.role;
      this.type = options.type;
      this.accelerator = options.accelerator;
      this.registerAccelerator = options.registerAccelerator;
      this.click = options.click;
      this.submenu = options.submenu ? new FakeMenu(options.submenu) : undefined;
    }
  }

  class FakeMenu {
    readonly items: FakeItem[];

    constructor(template: TemplateItem[] = []) {
      this.items = template.map((item) => new FakeItem(item));
    }

    getMenuItemById(id: string): FakeItem | null {
      const search = (items: FakeItem[]): FakeItem | null => {
        for (const item of items) {
          if (item.id === id) {
            return item;
          }
          const found = item.submenu ? search(item.submenu.items) : null;
          if (found) {
            return found;
          }
        }
        return null;
      };
      return search(this.items);
    }
  }

  const state = {
    menu: null as FakeMenu | null,
    templates: [] as TemplateItem[][],
  };
  const Menu = {
    buildFromTemplate: vi.fn((template: TemplateItem[]) => {
      state.templates.push(template);
      return new FakeMenu(template);
    }),
    setApplicationMenu: vi.fn((menu: FakeMenu | null) => {
      state.menu = menu;
    }),
    getApplicationMenu: vi.fn(() => state.menu),
  };

  return {
    app: { getName: () => "SolidMD" },
    BrowserWindow: {},
    FakeMenu,
    Menu,
    state,
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: electron.BrowserWindow,
  Menu: electron.Menu,
}));

import {
  applyMenuContribution,
  buildContributionTemplate,
  buildSkeletonTemplate,
  createMenu,
  createMenuController,
  patchContribution,
} from "../../src/main/app/menu";
import { setMainWindow } from "../../src/main/app/window";

interface TemplateShape {
  id?: string;
  label?: string;
  role?: string;
  type?: string;
  enabled?: boolean;
  checked?: boolean;
  accelerator?: string;
  registerAccelerator?: boolean;
  click?: () => void;
  submenu?: TemplateShape[];
}

type TestMenu = InstanceType<typeof electron.FakeMenu>;

const asShape = (template: MenuItemConstructorOptions[]): TemplateShape[] =>
  template as unknown as TemplateShape[];

const contribution: MenuContribution = {
  fileMenuTitle: "File",
  items: [
    { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" },
    { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S" },
    {
      id: "file-save-as",
      title: "Save As",
      accelerator: "CmdOrCtrl+Shift+S",
      enabled: false,
      checked: true,
    },
    {
      id: "file-compare-open",
      title: "Compare Open Files",
      accelerator: "CmdOrCtrl+Shift+C",
    },
  ],
};

function fileSubmenu(template: MenuItemConstructorOptions[]): TemplateShape[] {
  return asShape(template)[0]?.submenu ?? [];
}

describe("menu skeleton", () => {
  it("AC-R5-21: has no File action items and works without a renderer", () => {
    const template = buildSkeletonTemplate("linux", "SolidMD");
    const shaped = asShape(template);

    expect(shaped.map((item) => item.label ?? item.role)).toEqual([
      "File",
      "Edit",
      "windowMenu",
      "help",
    ]);
    expect(fileSubmenu(template)).toEqual([{ role: "quit" }]);
    const editMenu = shaped[1]?.submenu ?? [];
    expect(editMenu.map((item) => item.role ?? item.type)).toEqual([
      "cut",
      "copy",
      "paste",
      "separator",
      "selectAll",
    ]);
  });

  it("AC-R5-21: uses role-supplied labels for the macOS application menu", () => {
    const template = buildSkeletonTemplate("darwin", "SolidMD");
    const appMenu = asShape(template)[0] ?? {};

    expect(appMenu.label).toBe("SolidMD");
    expect((appMenu.submenu ?? []).map((item) => item.role ?? item.label ?? item.type))
      .toEqual([
        "about",
        "separator",
        "Settings",
        "separator",
        "services",
        "separator",
        "hide",
        "hideOthers",
        "unhide",
        "separator",
        "quit",
      ]);
  });
});

describe("contributed menu template", () => {
  it("AC-R5-21: shows catalog titles and chords without registering accelerators", () => {
    const send = vi.fn();
    const template = buildContributionTemplate("linux", "SolidMD", contribution, send);
    const submenu = fileSubmenu(template);

    expect(asShape(template)[0]?.label).toBe("File");
    expect(submenu.map((item) => item.id ?? item.role ?? item.type)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
      "file-compare-open",
      "separator",
      "quit",
    ]);
    expect(submenu[0]).toMatchObject({
      id: "file-open",
      label: "Open",
      accelerator: "CmdOrCtrl+O",
      registerAccelerator: false,
      enabled: true,
      checked: false,
    });
    expect(submenu[3]).toMatchObject({
      id: "file-compare-open",
      accelerator: "CmdOrCtrl+Shift+C",
      registerAccelerator: false,
    });
    submenu[0]?.click?.();
    expect(send).toHaveBeenCalledWith("file-open");
  });

  it("AC-R5-21: leaves only Quit when the contribution has no items", () => {
    const template = buildContributionTemplate(
      "linux",
      "SolidMD",
      { fileMenuTitle: "File", items: [] },
      vi.fn(),
    );
    expect(fileSubmenu(template)).toEqual([{ role: "quit" }]);
  });

  it("AC-R5-21: creates the File menu after the macOS app menu", () => {
    const template = buildContributionTemplate("darwin", "SolidMD", contribution, vi.fn());

    expect(asShape(template)[1]?.label).toBe("File");
    expect((asShape(template)[1]?.submenu ?? []).map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
      "file-compare-open",
    ]);
  });
});

describe("menu patch in place", () => {
  it("AC-R5-21: updates label, enabled and checked without rebuilding", () => {
    const menu = new electron.FakeMenu(
      buildContributionTemplate("linux", "SolidMD", contribution, vi.fn()) as never,
    );
    const patched: MenuContribution = {
      fileMenuTitle: "Documents",
      items: [
        { id: "file-open", title: "Open file", accelerator: "CmdOrCtrl+O", enabled: false },
        { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S" },
        { id: "file-save-as", title: "Save As", accelerator: "CmdOrCtrl+Shift+S" },
      ],
    };

    patchContribution(menu, patched, "linux");

    expect(menu.items[0]?.label).toBe("Documents");
    expect(menu.getMenuItemById("file-open")).toMatchObject({
      label: "Open file",
      enabled: false,
      checked: false,
    });
    expect(menu.getMenuItemById("file-save")).toMatchObject({ enabled: true });
  });

  it("AC-R5-21: tolerates a missing menu, File menu or item", () => {
    expect(() => patchContribution(null, contribution, "linux")).not.toThrow();
    expect(() => patchContribution(new electron.FakeMenu([]), contribution, "linux"))
      .not.toThrow();
    expect(() => patchContribution(
      new electron.FakeMenu(
        buildSkeletonTemplate("linux", "SolidMD") as never,
      ),
      contribution,
      "linux",
    )).not.toThrow();
  });

  it("AC-PERF-06: a representative patch stays under 2 ms at p95", () => {
    const template = buildContributionTemplate("linux", "SolidMD", contribution, vi.fn());
    const samples: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const menu = new electron.FakeMenu(template as never);
      const started = performance.now();
      patchContribution(menu, contribution, "linux");
      samples.push(performance.now() - started);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    console.log(`menu patch distribution: p95 ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThan(2);
  });
});

describe("menu controller", () => {
  function controller() {
    let current: TestMenu | null = null;
    const buildFromTemplate = vi.fn((template: MenuItemConstructorOptions[]) =>
      new electron.FakeMenu(template as never));
    const setApplicationMenu = vi.fn((menu: TestMenu) => {
      current = menu;
    });
    const getApplicationMenu = vi.fn(() => current);
    const send = vi.fn();
    const host = { buildFromTemplate, setApplicationMenu, getApplicationMenu };
    const menu = createMenuController("linux", "SolidMD", host, send);
    return { buildFromTemplate, menu, setApplicationMenu, currentMenu: () => current };
  }

  it("AC-R5-21: rebuilds only when the item structure changes", () => {
    const { buildFromTemplate, currentMenu, menu, setApplicationMenu } = controller();
    menu.installSkeleton();

    expect(menu.applyContribution(contribution)).toBe("rebuilt");
    expect(buildFromTemplate).toHaveBeenCalledTimes(2);
    expect(setApplicationMenu).toHaveBeenCalledTimes(2);
    const item = currentMenu()?.getMenuItemById("file-open");
    expect(item?.enabled).toBe(true);

    const stateOnly: MenuContribution = {
      fileMenuTitle: "File",
      items: contribution.items.map((entry) => ({ ...entry, enabled: false })),
    };
    expect(menu.applyContribution(stateOnly)).toBe("patched");
    expect(buildFromTemplate).toHaveBeenCalledTimes(2);
    expect(setApplicationMenu).toHaveBeenCalledTimes(2);
    expect(item?.enabled).toBe(false);

    expect(menu.applyContribution({
      fileMenuTitle: "File",
      items: contribution.items.slice(0, 2),
    })).toBe("rebuilt");
    expect(buildFromTemplate).toHaveBeenCalledTimes(3);

    const reordered = [contribution.items[1], contribution.items[0], contribution.items[2]]
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    expect(menu.applyContribution({ fileMenuTitle: "File", items: reordered }))
      .toBe("rebuilt");
    expect(buildFromTemplate).toHaveBeenCalledTimes(4);
  });
});

describe("menu IPC contributions in main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electron.state.menu = null;
    electron.state.templates = [];
  });

  it("AC-R5-21: installs the skeleton, then rebuilds and patches live items", () => {
    createMenu();
    const skeleton = electron.state.menu;
    expect(skeleton?.getMenuItemById("file-open")).toBeNull();

    const webContents = { send: vi.fn() };
    setMainWindow({
      isDestroyed: () => false,
      webContents,
    } as unknown as Parameters<typeof setMainWindow>[0]);

    applyMenuContribution(contribution);
    const built = electron.state.menu;
    const open = built?.getMenuItemById("file-open");
    expect(open).not.toBeNull();
    open?.click?.();
    expect(webContents.send).toHaveBeenCalledWith(MENU_CHANNELS.command, "file-open");

    applyMenuContribution({
      fileMenuTitle: "File",
      items: contribution.items.map((entry, index) => ({
        ...entry,
        enabled: index !== 0,
      })),
    });
    expect(built?.getMenuItemById("file-open")?.enabled).toBe(false);
    expect(built).toBe(electron.state.menu);
  });

  it("AC-R5-21: drops a contribution when no skeleton has been installed", () => {
    expect(() => applyMenuContribution(contribution)).not.toThrow();
  });
});

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

describe("menu:contribute contract", () => {
  const item = { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" };

  it("AC-SEC-07: accepts exactly the valid shapes", () => {
    expect(isMenuContribution({ fileMenuTitle: "File", items: [] })).toBe(true);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [item] })).toBe(true);
    expect(isMenuContribution({
      fileMenuTitle: "File",
      items: [{ ...item, enabled: true, checked: false }],
    })).toBe(true);
  });

  it("AC-SEC-07: rejects unknown ids, wrong types and extra keys", () => {
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, id: "file-quit" }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, title: 42 }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, title: "" }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, title: "a\u0000b" }] }))
      .toBe(false);
    expect(isMenuContribution({
      fileMenuTitle: "File",
      items: [{ ...item, accelerator: "Ctrl+O;rm" }],
    })).toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, extra: true }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, enabled: "yes" }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [{ ...item, checked: 1 }] }))
      .toBe(false);
    expect(isMenuContribution({ fileMenuTitle: null, items: [] })).toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: "none" })).toBe(false);
    expect(isMenuContribution({ fileMenuTitle: "File", items: [], extra: true })).toBe(false);
    expect(isMenuContribution(null)).toBe(false);
    expect(isMenuContribution([])).toBe(false);
  });

  it("AC-SEC-07: rejects duplicate ids and more items than the contract allows", () => {
    expect(isMenuContribution({ fileMenuTitle: "File", items: [item, item] })).toBe(false);
    expect(isMenuContribution({
      fileMenuTitle: "File",
      items: [
        item,
        { ...item, id: "file-save" },
        { ...item, id: "file-save-as" },
        { ...item, id: "file-compare-open" },
        { ...item, id: "file-open" },
      ],
    })).toBe(false);
  });

  it("AC-SEC-07: rejects hostile own prototype keys, getters and proxies", () => {
    expect(isMenuContribution(withOwnProto({ fileMenuTitle: "File", items: [] })))
      .toBe(false);
    expect(isMenuContribution(withOwnProto({ fileMenuTitle: "File", items: [item] })))
      .toBe(false);

    const getter = { fileMenuTitle: "File", items: [] } as Record<string, unknown>;
    Object.defineProperty(getter, "items", {
      enumerable: true,
      get: () => [],
    });
    expect(isMenuContribution(getter)).toBe(false);

    const symbol = { fileMenuTitle: "File", items: [] } as Record<PropertyKey, unknown>;
    symbol[Symbol("extra")] = true;
    expect(isMenuContribution(symbol)).toBe(false);

    const hostileProxy = new Proxy({}, {
      ownKeys: () => {
        throw new Error("hostile proxy");
      },
    });
    expect(isMenuContribution(hostileProxy)).toBe(false);
  });
});
