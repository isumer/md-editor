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

import { registerMenuIpcHandler } from "../../src/main/ipc/menu";
import {
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "../../src/main/ipc/handle";
import type { ContributionPump } from "../../src/main/app/menuContribution";
import type { MenuContribution } from "../../src/shared/ipc/menu";

const APP_URL = "app://bundle/index.html";
const CHANNEL = "menu:contribute";

const valid: MenuContribution = {
  fileMenuTitle: "File",
  items: [
    { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" },
    { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S", enabled: false, checked: true },
  ],
};

interface Boundary {
  mainFrame: { url: string };
  webContents: object;
  window: object;
}

function createBoundary(): Boundary {
  const mainFrame = { url: APP_URL };
  const webContents = { mainFrame };
  const window = { id: 23, webContents };
  electron.fromWebContents.mockReturnValue(window);
  registerTrustedWindow(window as never, APP_URL);
  return { mainFrame, webContents, window };
}

async function invoke(
  boundary: Boundary,
  ...args: unknown[]
): Promise<unknown> {
  const handler = electron.handlers.get(CHANNEL);
  if (!handler) {
    throw new Error("menu contribution handler was not registered");
  }
  return handler({
    sender: boundary.webContents,
    senderFrame: boundary.mainFrame,
  }, ...args);
}

function createPump(): ContributionPump & { readonly push: ReturnType<typeof vi.fn> } {
  return { push: vi.fn(), flush: vi.fn() } as unknown as
    ContributionPump & { readonly push: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

describe("menu:contribute handler", () => {
  it("AC-SEC-10: forwards a valid contribution from the trusted top frame", async () => {
    const contributions = createPump();
    registerMenuIpcHandler(contributions);
    const boundary = createBoundary();

    await expect(invoke(boundary, valid)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(contributions.push).toHaveBeenCalledTimes(1);
    expect(contributions.push).toHaveBeenCalledWith(valid);
    unregisterTrustedWindow(boundary.window as never);
  });

  it("AC-SEC-10: refuses a subframe or foreign URL without pushing", async () => {
    const contributions = createPump();
    registerMenuIpcHandler(contributions);
    const boundary = createBoundary();

    await expect(invoke(boundary, valid)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(contributions.push).toHaveBeenCalledTimes(1);

    electron.fromWebContents.mockReturnValue(boundary.window);
    await expect(electron.handlers.get(CHANNEL)?.(
      { sender: boundary.webContents, senderFrame: { url: APP_URL } },
      valid,
    )).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN_SENDER" } });

    boundary.mainFrame.url = "https://attacker.example/";
    await expect(invoke(boundary, valid))
      .resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN_SENDER" } });

    expect(contributions.push).toHaveBeenCalledTimes(1);
    unregisterTrustedWindow(boundary.window as never);
  });

  it("AC-SEC-07: rejects malformed payloads without pushing", async () => {
    const contributions = createPump();
    registerMenuIpcHandler(contributions);
    const boundary = createBoundary();

    const malformed: unknown[] = [
      undefined,
      null,
      {},
      [],
      "contribution",
      { fileMenuTitle: "File", items: [{ id: "file-quit", title: "Quit", accelerator: "CmdOrCtrl+Q" }] },
      { fileMenuTitle: "File", items: [{ id: "file-open", title: "Open", accelerator: "rm -rf" }] },
      { fileMenuTitle: "File", items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }], extra: true },
      { fileMenuTitle: "File", items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }, { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }] },
    ];

    for (const payload of malformed) {
      await expect(invoke(boundary, payload)).resolves.toMatchObject({
        ok: false,
        error: { code: "BAD_REQUEST" },
      });
    }
    expect(contributions.push).not.toHaveBeenCalled();
    unregisterTrustedWindow(boundary.window as never);
  });

  it("AC-SEC-07: rejects a valid payload sent with extra arguments", async () => {
    const contributions = createPump();
    registerMenuIpcHandler(contributions);
    const boundary = createBoundary();

    await expect(invoke(boundary, valid, "extra")).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expect(contributions.push).not.toHaveBeenCalled();
    unregisterTrustedWindow(boundary.window as never);
  });

  it("registers exactly the menu:contribute channel", () => {
    registerMenuIpcHandler(createPump());
    expect(electron.handle).toHaveBeenCalledTimes(1);
    expect(electron.handle.mock.calls[0]?.[0]).toBe(CHANNEL);
  });
});
