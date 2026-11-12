import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    fromWebContents: vi.fn(),
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  ipcMain: { handle: electron.handle },
}));

import {
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "../../src/main/ipc/handle";
import { registerWorkspaceIpcHandlers } from "../../src/main/ipc/workspace";

const appUrl = "app://bundle/index.html";

function createWindow() {
  const mainFrame = { url: appUrl };
  const webContents = { mainFrame };
  const window = { id: 21, webContents };
  electron.fromWebContents.mockReturnValue(window);
  registerTrustedWindow(window as never, appUrl);
  return { mainFrame, webContents, window };
}

async function invoke(
  window: { webContents: { mainFrame: { url: string } } },
  channel: string,
  request: unknown,
): Promise<unknown> {
  const handler = electron.handlers.get(channel);
  if (!handler) {
    throw new Error(`handler was not registered: ${channel}`);
  }
  return handler({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  }, request);
}

function service() {
  return {
    chooseRoot: vi.fn(async () => ({ name: "notes" })),
    createFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    listChildren: vi.fn(async () => [{ name: "daily.md", kind: "file" as const }]),
    openFile: vi.fn(async () => ({
      canonicalPath: "/notes/daily.md",
      grant: "grant",
      name: "daily.md",
    })),
    renameFile: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

describe("workspace IPC handlers", () => {
  it("AC-R11-01: passes the trusted window and request path to the service", async () => {
    const window = createWindow();
    const workspace = service();
    registerWorkspaceIpcHandlers(workspace as never);

    await expect(invoke(window.window, "workspace:choose-root", {}))
      .resolves.toEqual({ ok: true, value: { name: "notes" } });
    await expect(invoke(window.window, "workspace:list-children", { path: "notes" }))
      .resolves.toEqual({ ok: true, value: [{ name: "daily.md", kind: "file" }] });
    await expect(invoke(window.window, "workspace:open-file", { path: "notes/daily.md" }))
      .resolves.toMatchObject({ ok: true, value: { name: "daily.md" } });
    await expect(invoke(window.window, "workspace:create-file", { path: "draft.md" }))
      .resolves.toEqual({ ok: true, value: undefined });
    await expect(invoke(window.window, "workspace:rename-file", {
      path: "draft.md", newPath: "done.md",
    })).resolves.toEqual({ ok: true, value: undefined });
    await expect(invoke(window.window, "workspace:delete-file", { path: "done.md" }))
      .resolves.toEqual({ ok: true, value: undefined });

    expect(workspace.chooseRoot).toHaveBeenCalledWith(window.window.id);
    expect(workspace.listChildren).toHaveBeenCalledWith(window.window.id, "notes");
    expect(workspace.openFile).toHaveBeenCalledWith(window.window.id, "notes/daily.md");
    expect(workspace.createFile).toHaveBeenCalledWith(window.window.id, "draft.md");
    expect(workspace.renameFile).toHaveBeenCalledWith(window.window.id, "draft.md", "done.md");
    expect(workspace.deleteFile).toHaveBeenCalledWith(window.window.id, "done.md");
    unregisterTrustedWindow(window.window as never);
  });

  it("AC-R11-01: refuses an invalid request before the service runs", async () => {
    const window = createWindow();
    const workspace = service();
    registerWorkspaceIpcHandlers(workspace as never);

    await expect(invoke(window.window, "workspace:choose-root", { path: "" }))
      .resolves.toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
    await expect(invoke(window.window, "workspace:list-children", { path: 4 }))
      .resolves.toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
    await expect(invoke(window.window, "workspace:open-file", null))
      .resolves.toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });

    expect(workspace.chooseRoot).not.toHaveBeenCalled();
    expect(workspace.listChildren).not.toHaveBeenCalled();
    expect(workspace.openFile).not.toHaveBeenCalled();
    unregisterTrustedWindow(window.window as never);
  });

  it("AC-R11-01: refuses an untrusted sender", async () => {
    const window = createWindow();
    const workspace = service();
    registerWorkspaceIpcHandlers(workspace as never);
    electron.fromWebContents.mockReturnValue(null);

    await expect(invoke(window.window, "workspace:list-children", { path: "" }))
      .resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN_SENDER" } });
    expect(workspace.listChildren).not.toHaveBeenCalled();
    unregisterTrustedWindow(window.window as never);
  });

  it("AC-R11-01: reports a service failure as a tagged error result", async () => {
    const window = createWindow();
    const workspace = service();
    workspace.listChildren.mockRejectedValueOnce(
      new Error("folder vanished"),
    );
    registerWorkspaceIpcHandlers(workspace as never);

    await expect(invoke(window.window, "workspace:list-children", { path: "notes" }))
      .resolves.toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
    unregisterTrustedWindow(window.window as never);
  });
});
