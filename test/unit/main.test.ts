import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const appHandlers = new Map<string, (...args: unknown[]) => unknown>();
  let readyHandler: (() => Promise<void>) | undefined;
  let menuTemplate: unknown[] = [];

  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = [];
    static getAllWindows = vi.fn(() => BrowserWindowMock.instances);

    readonly options: Record<string, unknown>;
    readonly windowHandlers = new Map<string, (...args: any[]) => unknown>();
    readonly webHandlers = new Map<string, (...args: any[]) => unknown>();
    windowOpenHandler: ((details: { url: string }) => unknown) | undefined;
    destroyed = false;
    show = vi.fn();
    loadFile = vi.fn(async () => undefined);
    webContents = {
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        this.webHandlers.set(event, handler);
      }),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => unknown) => {
        this.windowOpenHandler = handler;
      }),
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      BrowserWindowMock.instances.push(this);
    }

    once(event: string, handler: (...args: any[]) => unknown) {
      this.windowHandlers.set(event, handler);
    }

    on(event: string, handler: (...args: any[]) => unknown) {
      this.windowHandlers.set(event, handler);
    }

    isDestroyed() {
      return this.destroyed;
    }
  }

  const app = {
    whenReady: vi.fn(() => ({
      then(handler: () => Promise<void>) {
        readyHandler = handler;
        return Promise.resolve();
      },
    })),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      appHandlers.set(event, handler);
    }),
    quit: vi.fn(),
  };
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler);
    }),
  };
  const Menu = {
    buildFromTemplate: vi.fn((template: unknown[]) => {
      menuTemplate = template;
      return { template };
    }),
    setApplicationMenu: vi.fn(),
  };
  const dialog = {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  };
  const shell = { openExternal: vi.fn(async () => undefined) };

  return {
    app,
    appHandlers,
    BrowserWindowMock,
    dialog,
    ipcHandlers,
    ipcMain,
    Menu,
    shell,
    get menuTemplate() {
      return menuTemplate;
    },
    get readyHandler() {
      return readyHandler;
    },
    reset() {
      ipcHandlers.clear();
      appHandlers.clear();
      readyHandler = undefined;
      menuTemplate = [];
      BrowserWindowMock.instances.length = 0;
      BrowserWindowMock.getAllWindows.mockReset();
      BrowserWindowMock.getAllWindows.mockImplementation(() => BrowserWindowMock.instances);
    },
  };
});

const fileSystem = vi.hoisted(() => {
  const handle = {
    writeFile: vi.fn(async () => undefined),
    sync: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return {
    chmod: vi.fn(async () => undefined),
    handle,
    open: vi.fn(async () => handle),
    readFile: vi.fn(),
    realpath: vi.fn(),
    rename: vi.fn(async () => undefined),
    stat: vi.fn(),
    unlink: vi.fn(async () => undefined),
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: electron.BrowserWindowMock,
  dialog: electron.dialog,
  ipcMain: electron.ipcMain,
  Menu: electron.Menu,
  shell: electron.shell,
}));
vi.mock("node:fs", () => ({ promises: fileSystem }));

const originalArgv = process.argv;
let addedProcessListeners: Array<{ event: "uncaughtException" | "unhandledRejection"; listener: (...args: any[]) => void }> = [];

async function loadMain() {
  const listenerBaselines = {
    uncaughtException: new Set(process.listeners("uncaughtException")),
    unhandledRejection: new Set(process.listeners("unhandledRejection")),
  };
  await import("../../src/main/main");
  addedProcessListeners = [
    ...process.listeners("uncaughtException")
      .filter((listener) => !listenerBaselines.uncaughtException.has(listener))
      .map((listener) => ({ event: "uncaughtException" as const, listener })),
    ...process.listeners("unhandledRejection")
      .filter((listener) => !listenerBaselines.unhandledRejection.has(listener))
      .map((listener) => ({ event: "unhandledRejection" as const, listener })),
  ];
}

async function invoke(channel: string, ...args: unknown[]) {
  const handler = electron.ipcHandlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler ${channel}`);
  }
  return handler({}, ...args);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.reset();
  for (const operation of [
    fileSystem.chmod,
    fileSystem.handle.writeFile,
    fileSystem.handle.sync,
    fileSystem.handle.close,
    fileSystem.open,
    fileSystem.readFile,
    fileSystem.realpath,
    fileSystem.rename,
    fileSystem.stat,
    fileSystem.unlink,
  ]) {
    operation.mockReset();
  }
  fileSystem.handle.writeFile.mockResolvedValue(undefined);
  fileSystem.handle.sync.mockResolvedValue(undefined);
  fileSystem.handle.close.mockResolvedValue(undefined);
  fileSystem.open.mockResolvedValue(fileSystem.handle);
  fileSystem.realpath.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  fileSystem.rename.mockResolvedValue(undefined);
  fileSystem.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  fileSystem.unlink.mockResolvedValue(undefined);
  electron.shell.openExternal.mockResolvedValue(undefined);
  process.argv = ["electron"];
});

afterEach(() => {
  process.argv = originalArgv;
  for (const { event, listener } of addedProcessListeners) {
    process.removeListener(event, listener);
  }
  addedProcessListeners = [];
  vi.restoreAllMocks();
});

describe("main process", () => {
  it("AC-R5-01: starts without an open-with file", async () => {
    await loadMain();
    await electron.readyHandler?.();

    await expect(invoke("file:initial")).resolves.toEqual({ ok: true, value: null });
  });

  it("AC-R5-02 AC-R5-08 AC-SEC-01: wraps file and link IPC results", async () => {
    await loadMain();
    expect([...electron.ipcHandlers.keys()]).toEqual([
      "file:initial",
      "file:open",
      "file:save",
      "file:save-as",
      "link:open-external",
    ]);
    await expect(invoke("file:initial")).resolves.toEqual({ ok: true, value: null });

    electron.dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/open.md"],
    });
    fileSystem.readFile.mockResolvedValue("opened text");
    await expect(invoke("file:open")).resolves.toEqual({
      ok: true,
      value: { path: "/tmp/open.md", text: "opened text" },
    });
    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(invoke("file:open")).resolves.toEqual({ ok: true, value: null });
    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(invoke("file:open")).resolves.toEqual({ ok: true, value: null });

    await expect(invoke("file:save", { path: "/tmp/save.md", text: "new" }))
      .resolves.toEqual({ ok: true, value: { path: "/tmp/save.md" } });
    expect(fileSystem.handle.writeFile).toHaveBeenCalledWith("new", { encoding: "utf8" });
    expect(fileSystem.handle.sync).toHaveBeenCalledTimes(1);
    expect(fileSystem.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/save\.md\..+\.tmp$/),
      "/tmp/save.md",
    );

    electron.dialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/save-as.md",
    });
    await expect(invoke("file:save-as", { path: null, text: "save as" }))
      .resolves.toEqual({ ok: true, value: { path: "/tmp/save-as.md" } });
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(invoke("file:save", { path: null, text: "cancel" }))
      .resolves.toEqual({ ok: true, value: null });
    electron.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false });
    await expect(invoke("file:save", { path: null, text: "no path" }))
      .resolves.toEqual({ ok: true, value: null });

    for (const invalid of [null, {}, { path: null }, { path: 1, text: "x" }, { path: null, text: 1 }]) {
      await expect(invoke("file:save", invalid)).resolves.toMatchObject({
        ok: false,
        code: "BAD_REQUEST",
      });
    }
    electron.dialog.showOpenDialog.mockRejectedValueOnce("dialog failed");
    await expect(invoke("file:open")).resolves.toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "dialog failed",
    });

    for (const url of ["https://example.com", "http://example.com", "mailto:test@example.com"]) {
      await expect(invoke("link:open-external", url)).resolves.toEqual({
        ok: true,
        value: undefined,
      });
    }
    for (const url of [42, "not a url", "file:///tmp/private.md"]) {
      await expect(invoke("link:open-external", url)).resolves.toMatchObject({
        ok: false,
        code: "BAD_REQUEST",
      });
    }
  });

  it("AC-R5-01 AC-R5-08 AC-PERF-01: creates a secure ready-to-show window and menu", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.argv = ["electron", "--inspect", "folder", "missing.md", "document.md"];
    fileSystem.stat.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith("folder")) {
        return { isFile: () => false };
      }
      if (filePath.endsWith("missing.md")) {
        throw new Error("missing");
      }
      return { isFile: () => true };
    });
    fileSystem.readFile.mockResolvedValue("startup text");

    await loadMain();
    for (const entry of addedProcessListeners) {
      entry.listener(entry.event === "uncaughtException" ? new Error("boom") : "rejected");
    }
    expect(errorSpy).toHaveBeenCalledTimes(2);

    await electron.readyHandler?.();
    const firstWindow = electron.BrowserWindowMock.instances[0];
    expect(firstWindow?.options).toMatchObject({
      show: false,
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    expect(firstWindow?.loadFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join("renderer", "index.html")),
    );
    expect(electron.Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    await expect(invoke("file:initial")).resolves.toEqual({
      ok: true,
      value: { path: path.resolve("document.md"), text: "startup text" },
    });

    firstWindow?.windowHandlers.get("ready-to-show")?.();
    expect(firstWindow?.show).toHaveBeenCalledTimes(1);
    if (firstWindow) {
      firstWindow.destroyed = true;
      firstWindow.windowHandlers.get("ready-to-show")?.();
      firstWindow.destroyed = false;
    }
    expect(firstWindow?.show).toHaveBeenCalledTimes(1);

    const submenu = (electron.menuTemplate[0] as any).submenu;
    submenu[0].click();
    submenu[1].click();
    submenu[2].click();
    expect(firstWindow?.webContents.send.mock.calls.map((call) => call[1])).toEqual([
      "open",
      "save",
      "saveAs",
    ]);
    if (firstWindow) {
      firstWindow.destroyed = true;
    }
    submenu[0].click();
    expect(firstWindow?.webContents.send).toHaveBeenCalledTimes(3);

    const navigationEvent = { preventDefault: vi.fn() };
    firstWindow?.webHandlers.get("render-process-gone")?.({}, { reason: "crashed" });
    firstWindow?.webHandlers.get("will-navigate")?.(navigationEvent, "file:///tmp/nope");
    expect(navigationEvent.preventDefault).toHaveBeenCalled();
    expect(firstWindow?.windowOpenHandler?.({ url: "https://example.com" })).toEqual({
      action: "deny",
    });
    firstWindow?.windowHandlers.get("unresponsive")?.();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("unresponsive"));

    firstWindow?.windowHandlers.get("closed")?.();
    electron.BrowserWindowMock.getAllWindows.mockReturnValueOnce([]);
    electron.appHandlers.get("activate")?.();
    expect(electron.BrowserWindowMock.instances).toHaveLength(2);
    electron.BrowserWindowMock.getAllWindows.mockReturnValueOnce(electron.BrowserWindowMock.instances);
    electron.appHandlers.get("activate")?.();
    expect(electron.BrowserWindowMock.instances).toHaveLength(2);

    electron.appHandlers.get("window-all-closed")?.();
    expect(electron.app.quit).toHaveBeenCalledTimes(1);
  });
});
