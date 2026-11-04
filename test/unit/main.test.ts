import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const appHandlers = new Map<string, (...args: unknown[]) => unknown>();
  let resolveReady: (() => void) | undefined;
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
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = vi.fn(() => false);
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
    getName: vi.fn(() => "MD Editor"),
    getPath: vi.fn(() => "/profiles/default"),
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    setPath: vi.fn(),
    whenReady: vi.fn(() => new Promise<void>((resolve) => { resolveReady = resolve; })),
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
    resolveReady() {
      resolveReady?.();
    },
    reset() {
      ipcHandlers.clear();
      appHandlers.clear();
      app.isPackaged = false;
      resolveReady = undefined;
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
    access: vi.fn(),
    chmod: vi.fn(async () => undefined),
    handle,
    mkdir: vi.fn(async () => undefined),
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
vi.mock("node:fs", () => ({
  constants: { F_OK: 0, W_OK: 2 },
  promises: fileSystem,
}));

const originalArgv = process.argv;
const originalAppImage = process.env.APPIMAGE;
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

async function readyApplication(): Promise<void> {
  await vi.waitFor(() => expect(electron.app.whenReady).toHaveBeenCalledOnce());
  electron.resolveReady();
  await vi.waitFor(() => expect(electron.BrowserWindowMock.instances).toHaveLength(1));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.reset();
  for (const operation of [
    fileSystem.access,
    fileSystem.chmod,
    fileSystem.handle.writeFile,
    fileSystem.handle.sync,
    fileSystem.handle.close,
    fileSystem.open,
    fileSystem.mkdir,
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
  fileSystem.access.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  fileSystem.mkdir.mockResolvedValue(undefined);
  fileSystem.open.mockResolvedValue(fileSystem.handle);
  fileSystem.realpath.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  fileSystem.rename.mockResolvedValue(undefined);
  fileSystem.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
  fileSystem.unlink.mockResolvedValue(undefined);
  electron.shell.openExternal.mockResolvedValue(undefined);
  process.argv = ["electron", "."];
});

afterEach(() => {
  process.argv = originalArgv;
  if (originalAppImage === undefined) {
    delete process.env.APPIMAGE;
  } else {
    process.env.APPIMAGE = originalAppImage;
  }
  for (const { event, listener } of addedProcessListeners) {
    process.removeListener(event, listener);
  }
  addedProcessListeners = [];
  vi.restoreAllMocks();
});

describe("main process", () => {
  it("AC-R5-01: starts without an open-with file", async () => {
    await loadMain();
    await readyApplication();

    await expect(invoke("file:open-requests-ready")).resolves.toEqual({
      ok: true,
      value: { notice: null, productName: "MD Editor" },
    });
    expect(electron.app.setPath).toHaveBeenCalledWith("userData", "/profiles/default");
  });

  it("AC-R9-01 AC-R9-03: takes the single-instance lock only after choosing the data directory", async () => {
    await loadMain();
    await readyApplication();

    // Chromium writes its lock files into userData, so the lock must follow setPath.
    const setPathOrder = electron.app.setPath.mock.invocationCallOrder[0];
    const lockOrder = electron.app.requestSingleInstanceLock.mock.invocationCallOrder[0];
    expect(setPathOrder).toBeDefined();
    expect(lockOrder).toBeDefined();
    expect(lockOrder).toBeGreaterThan(setPathOrder ?? Number.POSITIVE_INFINITY);
  });

  it("AC-R5-02 AC-R5-08 AC-SEC-01: wraps file and link IPC results", async () => {
    fileSystem.access
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("read only"));
    await loadMain();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/before-ready.md"],
    });
    fileSystem.readFile.mockResolvedValueOnce("before ready");
    await expect(invoke("file:open")).resolves.toEqual({
      ok: true,
      value: { path: "/tmp/before-ready.md", text: "before ready" },
    });
    electron.dialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/before-ready-save.md",
    });
    await expect(invoke("file:save", { path: null, text: "before ready" }))
      .resolves.toEqual({
        ok: true,
        value: { path: "/tmp/before-ready-save.md" },
      });
    fileSystem.handle.writeFile.mockClear();
    fileSystem.handle.sync.mockClear();
    fileSystem.rename.mockClear();
    await readyApplication();
    expect([...electron.ipcHandlers.keys()]).toEqual([
      "file:open",
      "file:save",
      "file:save-as",
      "link:open-external",
      "file:open-requests-ready",
    ]);

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
      // Separator-agnostic: on Windows the temp path is joined with backslashes.
      expect.stringMatching(/[\\/]tmp[\\/]save\.md\.[^\\/]+\.tmp$/),
      path.resolve("/tmp/save.md"),
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
    await expect(invoke("file:open-requests-ready")).resolves.toEqual({
      ok: true,
      value: {
        notice: "Portable data is not writable; using the default profile.",
        productName: "MD Editor",
      },
    });
  });

  it("AC-R5-01 AC-R5-08 AC-PERF-01: creates a secure ready-to-show window and menu", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    electron.app.isPackaged = true;
    process.env.APPIMAGE = path.join("media", "MD-Editor.AppImage");
    process.argv = ["electron", "--inspect", "folder", "missing.md", "document.md"];
    fileSystem.access.mockResolvedValue(undefined);
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

    await readyApplication();
    const firstWindow = electron.BrowserWindowMock.instances[0];
    expect(firstWindow?.options).toMatchObject({
      title: "MD Editor",
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
    expect(electron.app.setPath).toHaveBeenCalledWith(
      "userData",
      path.join("media", "data"),
    );
    await invoke("file:open-requests-ready");
    expect(firstWindow?.webContents.send).toHaveBeenCalledWith(
      "file:open-request",
      {
        ok: true,
        value: { path: path.resolve("document.md"), text: "startup text" },
      },
    );
    firstWindow?.webContents.send.mockClear();

    if (firstWindow) {
      firstWindow.isMinimized.mockReturnValueOnce(true);
    }
    fileSystem.readFile.mockResolvedValueOnce("second-instance text");
    electron.appHandlers.get("second-instance")?.(
      {},
      ["electron", "second.md"],
      path.join("sender", "cwd"),
    );
    await vi.waitFor(() => expect(firstWindow?.webContents.send).toHaveBeenCalledWith(
      "file:open-request",
      {
        ok: true,
        value: {
          path: path.resolve(path.join("sender", "cwd"), "second.md"),
          text: "second-instance text",
        },
      },
    ));
    expect(firstWindow?.restore).toHaveBeenCalledOnce();
    expect(firstWindow?.focus).toHaveBeenCalledOnce();

    firstWindow?.webContents.send.mockClear();
    fileSystem.readFile.mockRejectedValueOnce(new Error("open-file failed"));
    const openFileEvent = { preventDefault: vi.fn() };
    electron.appHandlers.get("open-file")?.(openFileEvent, "/tmp/from-finder.md");
    await vi.waitFor(() => expect(firstWindow?.webContents.send).toHaveBeenCalledWith(
      "file:open-request",
      { ok: false, code: "UNKNOWN", message: "open-file failed" },
    ));
    expect(openFileEvent.preventDefault).toHaveBeenCalledOnce();
    firstWindow?.webContents.send.mockClear();

    fileSystem.readFile.mockResolvedValueOnce("delivery failure");
    firstWindow?.webContents.send.mockImplementation(() => {
      throw new Error("renderer unavailable");
    });
    electron.appHandlers.get("open-file")?.(
      { preventDefault: vi.fn() },
      "/tmp/delivery-failure.md",
    );
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"open-file"'),
    ));
    firstWindow?.webContents.send.mockReset();

    if (firstWindow) {
      firstWindow.destroyed = true;
    }
    electron.appHandlers.get("second-instance")?.(
      {},
      ["electron", "/tmp/while-closed.md"],
      path.parse("/tmp/while-closed.md").root,
    );
    await invoke("file:open-requests-ready");
    if (firstWindow) {
      firstWindow.destroyed = false;
    }

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
    electron.shell.openExternal.mockRejectedValueOnce(new Error("shell failed"));
    firstWindow?.webHandlers.get("will-navigate")?.(
      { preventDefault: vi.fn() },
      "https://example.com/failure",
    );
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"open-external"'),
    ));
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
