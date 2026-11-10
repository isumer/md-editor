import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One shared Electron fake keeps this pre-existing process-lifecycle harness coherent.
const electron = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const appHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const protocolHandlers = new Map<string, (request: { url: string }) => Promise<Response>>();
  let resolveReady: (() => void) | undefined;
  let menuTemplate: unknown[] = [];

  class MessagePortMock {
    readonly handlers = new Map<string, (...args: any[]) => unknown>();
    close = vi.fn();
    postMessage = vi.fn();
    start = vi.fn();

    on(event: string, handler: (...args: any[]) => unknown) {
      this.handlers.set(event, handler);
      return this;
    }
  }

  class MessageChannelMainMock {
    readonly port1 = new MessagePortMock();
    readonly port2 = new MessagePortMock();
  }

  class UtilityProcessMock {
    static instances: UtilityProcessMock[] = [];
    readonly handlers = new Map<string, Array<(...args: any[]) => unknown>>();
    readonly posts: Array<{ message: any; ports: unknown[] }> = [];
    pid: number | undefined;
    kill = vi.fn(() => true);

    constructor() {
      UtilityProcessMock.instances.push(this);
      queueMicrotask(() => {
        this.pid = 10_000 + UtilityProcessMock.instances.indexOf(this);
        this.emit("spawn");
      });
    }

    on(event: string, handler: (...args: any[]) => unknown) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    once(event: string, handler: (...args: any[]) => unknown) {
      const wrapped = (...args: any[]) => {
        this.handlers.set(event, (this.handlers.get(event) ?? []).filter(
          (candidate) => candidate !== wrapped,
        ));
        handler(...args);
      };
      return this.on(event, wrapped);
    }

    emit(event: string, ...args: any[]): void {
      for (const handler of [...(this.handlers.get(event) ?? [])]) {
        handler(...args);
      }
    }

    postMessage(message: any, ports: unknown[] = []): void {
      this.posts.push({ message, ports });
      if (message.type === "registerGrant") {
        const filePath = String(message.path);
        queueMicrotask(() => this.emit("message", {
          id: message.id,
          result: {
            ok: true,
            value: {
              canonicalPath: filePath,
              name: filePath.split(/[\\/]/).at(-1) ?? filePath,
            },
          },
        }));
      }
      if (message.type === "resolveAsset") {
        queueMicrotask(() => this.emit("message", {
          id: message.id,
          result: { ok: true, value: { path: "/tmp/asset.png" } },
        }));
      }
      if (message.type === "readSession") {
        queueMicrotask(() => this.emit("message", {
          id: message.id,
          result: { ok: true, value: { version: 1, documents: [] } },
        }));
      }
      if (message.type === "writeSession") {
        queueMicrotask(() => this.emit("message", {
          id: message.id,
          result: { ok: true, value: {} },
        }));
      }
    }
  }

  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = [];
    static getAllWindows = vi.fn(() => BrowserWindowMock.instances);
    static fromId = vi.fn((id: number) =>
      BrowserWindowMock.instances.find((window) => window.id === id) ?? null);
    static fromWebContents = vi.fn((webContents: unknown) =>
      BrowserWindowMock.instances.find((window) => window.webContents === webContents) ?? null);

    readonly id: number;
    readonly options: Record<string, unknown>;
    readonly windowHandlers = new Map<string, (...args: any[]) => unknown>();
    readonly webHandlers = new Map<string, (...args: any[]) => unknown>();
    windowOpenHandler: ((details: { url: string }) => unknown) | undefined;
    destroyed = false;
    close = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = vi.fn(() => false);
    readonly mainFrame = { url: "" };
    loadURL = vi.fn(async (url: string) => {
      this.mainFrame.url = url;
    });
    webContents = {
      mainFrame: this.mainFrame,
      on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
        this.webHandlers.set(event, handler);
      }),
      send: vi.fn(),
      postMessage: vi.fn(),
      reload: vi.fn(),
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => unknown) => {
        this.windowOpenHandler = handler;
      }),
    };

    constructor(options: Record<string, unknown>) {
      this.id = BrowserWindowMock.instances.length + 1;
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
  const net = { fetch: vi.fn(async () => new Response(null, { status: 404 })) };
  const protocol = {
    handle: vi.fn((scheme: string, handler: (request: { url: string }) => Promise<Response>) => {
      protocolHandlers.set(scheme, handler);
    }),
    registerSchemesAsPrivileged: vi.fn(),
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
    MessageChannelMainMock,
    dialog,
    ipcHandlers,
    ipcMain,
    Menu,
    net,
    protocol,
    protocolHandlers,
    shell,
    UtilityProcessMock,
    get menuTemplate() {
      return menuTemplate;
    },
    resolveReady() {
      resolveReady?.();
    },
    reset() {
      ipcHandlers.clear();
      appHandlers.clear();
      protocolHandlers.clear();
      app.isPackaged = false;
      resolveReady = undefined;
      menuTemplate = [];
      BrowserWindowMock.instances.length = 0;
      BrowserWindowMock.getAllWindows.mockReset();
      BrowserWindowMock.getAllWindows.mockImplementation(() => BrowserWindowMock.instances);
      BrowserWindowMock.fromId.mockClear();
      BrowserWindowMock.fromWebContents.mockClear();
      UtilityProcessMock.instances.length = 0;
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
  MessageChannelMain: electron.MessageChannelMainMock,
  Menu: electron.Menu,
  net: electron.net,
  protocol: electron.protocol,
  shell: electron.shell,
  utilityProcess: {
    fork: vi.fn(() => new electron.UtilityProcessMock()),
  },
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
  const window = electron.BrowserWindowMock.instances[0];
  if (!window) {
    throw new Error("IPC invocation requires an application window");
  }
  return handler({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  }, ...args);
}

async function readyApplication(): Promise<void> {
  await vi.waitFor(() => expect(electron.app.whenReady).toHaveBeenCalledOnce());
  electron.resolveReady();
  await vi.waitFor(() => expect(electron.BrowserWindowMock.instances).toHaveLength(1));
}

async function withPlatform(
  platform: NodeJS.Platform,
  operation: () => Promise<void>,
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  try {
    await operation();
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  }
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

    await expect(invoke("file:open-requests-ready", {})).resolves.toEqual({
      ok: true,
      value: { notice: null, productName: "MD Editor", windowId: 1 },
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

  it("AC-R9-03: a second instance quits without opening a window", async () => {
    electron.app.requestSingleInstanceLock.mockReturnValueOnce(false);

    await loadMain();

    await vi.waitFor(() => expect(electron.app.quit).toHaveBeenCalledOnce());
    expect(electron.app.whenReady).not.toHaveBeenCalled();
    expect(electron.BrowserWindowMock.instances).toHaveLength(0);
  });

  it("AC-R9-01: a startup failure is logged and the app quits", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    electron.app.getPath.mockImplementationOnce(() => {
      throw new Error("profile unavailable");
    });

    await loadMain();

    await vi.waitFor(() => expect(electron.app.quit).toHaveBeenCalledOnce());
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("profile unavailable"));
    expect(electron.BrowserWindowMock.instances).toHaveLength(0);
  });

  it("AC-R5-02 AC-R5-08 AC-SEC-01: wraps file and link IPC results", async () => {
    fileSystem.access
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("read only"));
    await loadMain();
    await readyApplication();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/before-ready.md"],
    });
    fileSystem.readFile.mockResolvedValueOnce("before ready");
    fileSystem.realpath.mockResolvedValueOnce("/tmp/before-ready.md");
    const firstOpen = await invoke("file:open", {});
    expect(firstOpen).toMatchObject({
      ok: true,
      value: { name: "before-ready.md", grant: expect.any(String) },
    });
    const firstGrant = (firstOpen as { value: { grant: string } }).value.grant;
    fileSystem.realpath.mockResolvedValueOnce("/tmp/dropped.md");
    await expect(invoke("file:open-path", { path: "/tmp/dropped.md" }))
      .resolves.toMatchObject({
        ok: true,
        value: { name: "dropped.md", grant: expect.any(String) },
      });
    electron.dialog.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/tmp/before-ready-save.md",
    });
    await expect(invoke("file:choose-save-target", { grant: firstGrant }))
      .resolves.toMatchObject({
        ok: true,
        value: { name: "before-ready-save.md" },
      });
    await expect(invoke("file:release-document", { grant: firstGrant }))
      .resolves.toEqual({ ok: true, value: undefined });
    expect([...electron.ipcHandlers.keys()]).toEqual([
      "file:open",
      "file:open-path",
      "file:choose-save-target",
      "file:release-document",
      "link:open-external",
      "file:open-requests-ready",
      "menu:contribute",
      "workspace:choose-root",
      "workspace:list-children",
      "workspace:open-file",
      "session:load",
      "session:close-result",
    ]);

    for (const url of ["https://example.com", "http://example.com", "mailto:test@example.com"]) {
      await expect(invoke("link:open-external", { url })).resolves.toEqual({
        ok: true,
        value: undefined,
      });
    }
    for (const [url, code] of [
      [42, "BAD_REQUEST"],
      ["not a url", "BAD_REQUEST"],
      ["file:///tmp/private.md", "UNSUPPORTED_SCHEME"],
    ] as const) {
      await expect(invoke("link:open-external", { url })).resolves.toMatchObject({
        ok: false,
        error: { code },
      });
    }
    await expect(invoke("file:open-requests-ready", {})).resolves.toMatchObject({
      ok: true,
      value: { productName: "MD Editor" },
    });
  });

  it("AC-R4-07: reloads the renderer after a crash but not after a clean exit", async () => {
    await loadMain();
    await readyApplication();
    const window = electron.BrowserWindowMock.instances[0];
    const processGone = window?.webHandlers.get("render-process-gone");

    processGone?.({}, { reason: "clean-exit" });
    expect(window?.webContents.reload).not.toHaveBeenCalled();

    processGone?.({}, { reason: "crashed" });
    expect(window?.webContents.reload).toHaveBeenCalledOnce();
  });

  it("AC-SEC-16 AC-SEC-17: serves document assets only through the resolver", async () => {
    await loadMain();
    await readyApplication();
    const serve = electron.protocolHandlers.get("doc-asset");
    if (!serve) {
      throw new Error("doc-asset protocol handler was not registered");
    }
    const assetResponse = new Response("png", { status: 200 });
    electron.net.fetch.mockResolvedValueOnce(assetResponse);

    await expect(serve({ url: "doc-asset://1/grant/../outside.png" }))
      .resolves.toMatchObject({ status: 404 });
    await expect(serve({ url: "doc-asset://1/grant/images/pic.png" }))
      .resolves.toBe(assetResponse);

    expect(electron.net.fetch).toHaveBeenCalledWith(
      pathToFileURL("/tmp/asset.png").href,
    );
    const requests = electron.UtilityProcessMock.instances[0]?.posts
      .map(({ message }) => message)
      .filter((message: { type?: string }) => message.type === "resolveAsset");
    expect(requests).toEqual([expect.objectContaining({
      windowId: 1,
      grant: "grant",
      relativePath: "images/pic.png",
    })]);
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
    fileSystem.realpath.mockImplementation(async (filePath: string) => filePath);

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
        webSecurity: true,
      },
    });
    expect(firstWindow?.loadURL).toHaveBeenCalledWith("app://bundle/index.html");
    expect(electron.protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([{
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
      },
    }, {
      scheme: "doc-asset",
      privileges: {
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
      },
    }]);
    expect(electron.protocol.registerSchemesAsPrivileged).toHaveBeenCalledOnce();
    expect(electron.protocol.handle).toHaveBeenCalledWith("app", expect.any(Function));
    expect(electron.protocol.handle).toHaveBeenCalledWith("doc-asset", expect.any(Function));
    const schemeOrder = electron.protocol.registerSchemesAsPrivileged.mock.invocationCallOrder[0];
    const readyOrder = electron.app.whenReady.mock.invocationCallOrder[0];
    expect(schemeOrder).toBeLessThan(readyOrder ?? Number.NEGATIVE_INFINITY);
    expect(electron.Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(electron.app.setPath).toHaveBeenCalledWith(
      "userData",
      path.join("media", "data"),
    );
    await invoke("file:open-requests-ready", {});
    expect(firstWindow?.webContents.send).toHaveBeenCalledWith(
      "file:open-request",
      {
        ok: true,
        value: {
          canonicalPath: expect.any(String),
          grant: expect.any(String),
          name: "document.md",
        },
      },
    );
    firstWindow?.webHandlers.get("did-finish-load")?.();
    await vi.waitFor(() => expect(firstWindow?.webContents.postMessage)
      .toHaveBeenCalledWith("io:port", null, [expect.anything()]));
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
          canonicalPath: expect.any(String),
          grant: expect.any(String),
          name: "second.md",
        },
      },
    ));
    expect(firstWindow?.restore).toHaveBeenCalledOnce();
    expect(firstWindow?.focus).toHaveBeenCalledOnce();

    firstWindow?.webContents.send.mockClear();
    const openFileEvent = { preventDefault: vi.fn() };
    electron.appHandlers.get("open-file")?.(openFileEvent, "/tmp/from-finder.md");
    await vi.waitFor(() => expect(firstWindow?.webContents.send).toHaveBeenCalledWith(
      "file:open-request",
      {
        ok: true,
        value: {
          canonicalPath: expect.any(String),
          grant: expect.any(String),
          name: "from-finder.md",
        },
      },
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
    await invoke("file:open-requests-ready", {});
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

    // macOS leads with the application menu (it owns Quit there); elsewhere File comes first.
    const firstMenu = electron.menuTemplate[0] as any;
    if (process.platform === "darwin") {
      expect(firstMenu.label).toBe("MD Editor");
      expect(firstMenu.submenu).toContainEqual({ role: "quit" });
    } else {
      expect(firstMenu.label).toBe("File");
      expect(firstMenu.submenu).toEqual([{ role: "quit" }]);
    }

    const navigationEvent = { preventDefault: vi.fn() };
    firstWindow?.webHandlers.get("render-process-gone")?.({}, { reason: "crashed" });
    firstWindow?.webHandlers.get("will-navigate")?.(navigationEvent, "file:///tmp/nope");
    expect(navigationEvent.preventDefault).toHaveBeenCalled();
    const appNavigationEvent = { preventDefault: vi.fn() };
    firstWindow?.webHandlers.get("will-navigate")?.(
      appNavigationEvent,
      "app://bundle/index.html",
    );
    expect(appNavigationEvent.preventDefault).not.toHaveBeenCalled();
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
    // On macOS the app stays running with no windows, as the platform expects.
    expect(electron.app.quit).toHaveBeenCalledTimes(process.platform === "darwin" ? 0 : 1);
  });

  it("AC-R5-17 AC-SEC-10: sends io-worker ports only to the app frame and logs worker exits", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await loadMain();
    await readyApplication();
    const window = electron.BrowserWindowMock.instances[0];
    const worker = electron.UtilityProcessMock.instances[0];
    await vi.waitFor(() => expect(worker?.pid).toBeDefined());

    if (window) {
      // A same-prefix URL must be refused too: the check is exact match, not startsWith.
      window.mainFrame.url = "app://bundle/index.html/extra";
    }
    window?.webHandlers.get("did-finish-load")?.();
    await vi.waitFor(() => expect(worker?.posts).toContainEqual(expect.objectContaining({
      message: { type: "attachPort", windowId: window?.id },
    })));
    expect(window?.webContents.postMessage).not.toHaveBeenCalled();

    worker?.emit("exit", 9);
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({
      event: "io-worker-exit",
      code: 9,
      signal: null,
    }));
    expect(window?.webContents.send).not.toHaveBeenCalledWith("io:port-lost");
    const replacement = electron.UtilityProcessMock.instances[1];
    await vi.waitFor(() => expect(replacement?.pid).toBeDefined());
    if (replacement) {
      replacement.postMessage = () => {
        throw new Error("worker channel closed");
      };
    }
    window?.webHandlers.get("did-finish-load")?.();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"io-port"'),
    ));
    window?.windowHandlers.get("closed")?.();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"close-window"'),
    ));

    electron.appHandlers.get("will-quit")?.();
    expect(replacement?.kill).toHaveBeenCalledOnce();
  });

  it("AC-R5-17: tells the window when its io-worker port is lost", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await loadMain();
    await readyApplication();
    const window = electron.BrowserWindowMock.instances[0];
    const worker = electron.UtilityProcessMock.instances[0];
    await vi.waitFor(() => expect(worker?.pid).toBeDefined());
    window?.webHandlers.get("did-finish-load")?.();
    await vi.waitFor(() => expect(worker?.posts).toContainEqual(expect.objectContaining({
      message: { type: "attachPort", windowId: window?.id },
    })));

    worker?.emit("exit", 9);

    expect(window?.webContents.send).toHaveBeenCalledWith("io:port-lost");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"io-worker-exit"'));
  });

  it("AC-R4-06: asks the renderer before closing and writes the allowed session", async () => {
    await loadMain();
    await readyApplication();
    const window = electron.BrowserWindowMock.instances[0];
    if (!window) {
      throw new Error("missing application window");
    }
    fileSystem.access.mockResolvedValueOnce(undefined);
    fileSystem.readFile.mockResolvedValueOnce("saved text");
    fileSystem.realpath.mockResolvedValueOnce("/tmp/session-open.md");
    electron.dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/tmp/session-open.md"],
    });
    const opened = await invoke("file:open", {});
    const grant = (opened as { value: { grant: string } }).value.grant;

    const preventDefault = vi.fn();
    window.windowHandlers.get("close")?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(window.webContents.send).toHaveBeenCalledWith(
      "session:request-close",
      { id: 1 },
    ));

    await expect(invoke("session:close-result", {
      allow: true,
      documents: [
        {
          grant,
          name: "session-open.md",
          savedText: "saved text",
          text: "unsaved text",
        },
        {
          grant: "missing-grant",
          name: "gone.md",
          savedText: "saved",
          text: "unsaved",
        },
      ],
      id: 1,
    })).resolves.toEqual({ ok: true, value: undefined });
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    window.windowHandlers.get("close")?.({ preventDefault: vi.fn() });
    expect(window.close).toHaveBeenCalledOnce();

    const worker = electron.UtilityProcessMock.instances.at(-1);
    const write = worker?.posts.find(({ message }) =>
      (message as { type?: string }).type === "writeSession")?.message as
      | { session?: { documents?: unknown[]; version?: number } }
      | undefined;
    expect(write?.session).toEqual({
      documents: [{
        name: "session-open.md",
        path: "/tmp/session-open.md",
        savedText: "saved text",
        text: "unsaved text",
      }],
      version: 1,
    });
  });

  it("AC-R4-06: a failing close request still closes the window", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await loadMain();
    await readyApplication();
    const window = electron.BrowserWindowMock.instances[0];
    if (!window) {
      throw new Error("missing application window");
    }
    window.webContents.send.mockImplementationOnce(() => {
      throw new Error("renderer gone");
    });

    window.windowHandlers.get("close")?.({ preventDefault: vi.fn() });

    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({
      event: "close-request",
      message: "renderer gone",
    }));
  });

  it("AC-R4-06: a quit deferred by the close prompt quits after the window closes", async () => {
    await withPlatform("darwin", async () => {
      await loadMain();
      await readyApplication();
      const window = electron.BrowserWindowMock.instances[0];
      if (!window) {
        throw new Error("missing application window");
      }

      // app.quit() stops at the window close prompt. The quit must resume
      // once the user answers and the last window is gone.
      electron.appHandlers.get("before-quit")?.();
      window.windowHandlers.get("close")?.({ preventDefault: vi.fn() });
      await expect(invoke("session:close-result", {
        allow: true,
        documents: [],
        id: 1,
      })).resolves.toEqual({ ok: true, value: undefined });
      await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());

      electron.appHandlers.get("window-all-closed")?.();

      expect(electron.app.quit).toHaveBeenCalledOnce();
    });
  });

  it("AC-R4-06: cancelling the close prompt cancels the deferred quit", async () => {
    await withPlatform("darwin", async () => {
      await loadMain();
      await readyApplication();
      const window = electron.BrowserWindowMock.instances[0];
      if (!window) {
        throw new Error("missing application window");
      }

      electron.appHandlers.get("before-quit")?.();
      window.windowHandlers.get("close")?.({ preventDefault: vi.fn() });
      await expect(invoke("session:close-result", {
        allow: false,
        documents: [],
        id: 1,
      })).resolves.toEqual({ ok: true, value: undefined });

      electron.appHandlers.get("window-all-closed")?.();

      // Keep editing leaves the window open, so a later window close is a
      // plain macOS close, not the cancelled quit.
      expect(electron.app.quit).not.toHaveBeenCalled();
    });
  });
});
