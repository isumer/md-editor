import { beforeEach, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return {
    fromId: vi.fn(),
    fromWebContents: vi.fn(),
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: {
    fromId: electron.fromId,
    fromWebContents: electron.fromWebContents,
  },
  ipcMain: { handle: electron.handle },
}));

import { registerWindowIpcHandler } from "../../src/main/ipc/window";
import {
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "../../src/main/ipc/handle";
import { windowContracts } from "../../src/shared/ipc/window";

const APP_URL = "app://bundle/index.html";

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

it("AC-R2-03: toggles full screen through a validated top-frame request", async () => {
  const mainFrame = { url: APP_URL };
  const webContents = { mainFrame };
  const trustedWindow = { id: 23, webContents };
  const setFullScreen = vi.fn();
  const targetWindow = {
    isDestroyed: () => false,
    isFullScreen: () => false,
    setFullScreen,
  };
  electron.fromWebContents.mockReturnValue(trustedWindow);
  electron.fromId.mockReturnValue(targetWindow);
  registerTrustedWindow(trustedWindow as never, APP_URL);
  registerWindowIpcHandler();

  const handler = electron.handlers.get("window:toggle-full-screen");
  await expect(handler?.({ sender: webContents, senderFrame: mainFrame }, {}))
    .resolves.toEqual({ ok: true, value: undefined });
  expect(setFullScreen).toHaveBeenCalledWith(true);

  targetWindow.isFullScreen = () => true;
  await expect(handler?.({ sender: webContents, senderFrame: mainFrame }, {}))
    .resolves.toEqual({ ok: true, value: undefined });
  expect(setFullScreen).toHaveBeenLastCalledWith(false);

  electron.fromId.mockReturnValueOnce(null);
  await expect(handler?.({ sender: webContents, senderFrame: mainFrame }, {}))
    .resolves.toEqual({ ok: true, value: undefined });
  electron.fromId.mockReturnValueOnce({ isDestroyed: () => true });
  await expect(handler?.({ sender: webContents, senderFrame: mainFrame }, {}))
    .resolves.toEqual({ ok: true, value: undefined });

  await expect(handler?.({ sender: webContents, senderFrame: mainFrame }, { extra: true }))
    .resolves.toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
  unregisterTrustedWindow(trustedWindow as never);
});

it("AC-R2-03: accepts only an exact empty full-screen request", () => {
  const validate = windowContracts.toggleFullScreen.validate;
  const hostile = new Proxy({}, {
    ownKeys: () => {
      throw new Error("hostile proxy");
    },
  });

  expect(validate({})).toBe(true);
  expect([null, [], "", { extra: true }, hostile].map(validate))
    .toEqual([false, false, false, false, false]);
});
