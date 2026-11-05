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
import { registerSessionIpcHandler } from "../../src/main/ipc/session";

const appUrl = "app://bundle/index.html";

function createWindow() {
  const mainFrame = { url: appUrl };
  const webContents = { mainFrame };
  const window = { id: 17, webContents };
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

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

describe("session IPC handler", () => {
  it("AC-R4-08: loads restorable documents and skips a document that cannot be opened", async () => {
    const window = createWindow();
    const read = vi.fn(async () => ({
      documents: [
        { name: "first.md", path: "/docs/first.md", savedText: "a", text: "b" },
        { name: "gone.md", path: "/docs/gone.md", savedText: "c", text: "d" },
      ],
      version: 1,
    }));
    const openPath = vi.fn(async (_windowId: number, path: string) => {
      if (path.endsWith("gone.md")) {
        throw new Error("missing");
      }
      return { grant: "grant-first", name: "first.md" };
    });
    const settle = vi.fn(async () => undefined);
    registerSessionIpcHandler(
      { read } as never,
      { openPath } as never,
      { settle } as never,
    );

    await expect(invoke(window.window, "session:load", {})).resolves.toEqual({
      ok: true,
      value: {
        documents: [{
          grant: "grant-first",
          name: "first.md",
          savedText: "a",
          text: "b",
        }],
      },
    });
    expect(openPath).toHaveBeenCalledWith(window.window.id, "/docs/first.md");
    expect(openPath).toHaveBeenCalledWith(window.window.id, "/docs/gone.md");
    unregisterTrustedWindow(window.window as never);
  });

  it("AC-R4-06: forwards a close result to the close-request broker", async () => {
    const window = createWindow();
    const settle = vi.fn(async () => undefined);
    registerSessionIpcHandler(
      { read: vi.fn() } as never,
      { openPath: vi.fn() } as never,
      { settle } as never,
    );
    const result = { allow: true, documents: [], id: 3 };

    await expect(invoke(window.window, "session:close-result", result))
      .resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(settle).toHaveBeenCalledWith(result, window.window.id);
    unregisterTrustedWindow(window.window as never);
  });
});
