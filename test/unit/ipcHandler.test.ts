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
  handle,
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "../../src/main/ipc/handle";

const contract = {
  channel: "test:operation",
  validate: (value: unknown): value is { value: string } =>
    typeof value === "object" && value !== null &&
    "value" in value && typeof value.value === "string",
};

function createBoundary() {
  const mainFrame = { url: "file:///app/index.html" };
  const webContents = { mainFrame };
  const window = { id: 17, webContents };
  electron.fromWebContents.mockReturnValue(window);
  registerTrustedWindow(window as never, "file:///app/index.html");
  return { mainFrame, webContents, window };
}

async function invoke(event: unknown, request: unknown): Promise<unknown> {
  const handler = electron.handlers.get(contract.channel);
  if (!handler) {
    throw new Error("handler was not registered");
  }
  return handler(event, request);
}

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

describe("IPC handler boundary", () => {
  it("AC-SEC-10: lets a created window's own top frame call a valid handler", async () => {
    const boundary = createBoundary();
    handle(contract, async (request, context) => ({
      value: request.value,
      windowId: context.windowId,
    }));

    await expect(invoke({
      sender: boundary.webContents,
      senderFrame: boundary.mainFrame,
    }, { value: "allowed" })).resolves.toEqual({
      ok: true,
      value: { value: "allowed", windowId: 17 },
    });
    unregisterTrustedWindow(boundary.window as never);
  });

  it.each([
    ["a subframe", { url: "file:///app/index.html" }],
    ["a foreign URL", { url: "https://attacker.example/" }],
  ])("AC-SEC-10: refuses %s before the service runs", async (_name, senderFrame) => {
    const boundary = createBoundary();
    const service = vi.fn(async () => "must not run");
    handle(contract, service);

    await expect(invoke({ sender: boundary.webContents, senderFrame }, {
      value: "blocked",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN_SENDER" },
    });
    expect(service).not.toHaveBeenCalled();
    unregisterTrustedWindow(boundary.window as never);
  });

  it("AC-SEC-10: refuses a sender that is not owned by a BrowserWindow", async () => {
    const service = vi.fn(async () => "must not run");
    electron.fromWebContents.mockReturnValueOnce(null);
    handle(contract, service);

    await expect(invoke({
      sender: {},
      senderFrame: { url: "file:///app/index.html" },
    }, { value: "blocked" })).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN_SENDER" },
    });
    expect(service).not.toHaveBeenCalled();
  });

  it("AC-SEC-07: refuses invalid requests before the service runs", async () => {
    const boundary = createBoundary();
    const service = vi.fn(async () => "must not run");
    handle(contract, service);

    await expect(invoke({
      sender: boundary.webContents,
      senderFrame: boundary.mainFrame,
    }, { value: 42 })).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expect(service).not.toHaveBeenCalled();
    unregisterTrustedWindow(boundary.window as never);
  });

  it("AC-SEC-10: maps service failures instead of throwing over IPC", async () => {
    const boundary = createBoundary();
    handle(contract, async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    await expect(invoke({
      sender: boundary.webContents,
      senderFrame: boundary.mainFrame,
    }, { value: "accepted" })).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    unregisterTrustedWindow(boundary.window as never);
  });
});
