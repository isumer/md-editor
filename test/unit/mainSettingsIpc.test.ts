import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../src/shared/settings/settings";
import { DEFAULT_SETTINGS } from "../../src/shared/settings/settings";

// Mock electron's ipcMain
const ipcHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
    ipcHandlers.set(channel, handler);
  }),
};

// Mock trusted window for senderContext
const mockTrustedWindow = {
  id: 1,
  isDestroyed: () => false,
  webContents: { mainFrame: { url: "app://localhost" } },
};

vi.mock("electron", () => ({
  ipcMain: mockIpcMain,
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockTrustedWindow),
    getAllWindows: vi.fn(() => []),
  },
}));

function createMockStore(): {
  read: ReturnType<typeof vi.fn<() => Promise<Settings>>>;
  write: ReturnType<typeof vi.fn<(settings: Settings) => Promise<void>>>;
} {
  return {
    read: vi.fn(() => Promise.resolve(DEFAULT_SETTINGS)),
    write: vi.fn(() => Promise.resolve()),
  };
}

async function registerHandlers(
  store: ReturnType<typeof createMockStore>,
): Promise<void> {
  const { registerTrustedWindow } = await import("../../src/main/ipc/handle");
  const { registerSettingsIpcHandler } = await import("../../src/main/ipc/settings");
  registerTrustedWindow(mockTrustedWindow as never, "app://localhost");
  registerSettingsIpcHandler(store);
}

function trustedEvent(): unknown {
  return {
    sender: mockTrustedWindow.webContents,
    senderFrame: mockTrustedWindow.webContents.mainFrame,
  };
}

describe("registerSettingsIpcHandler", () => {
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    ipcHandlers.clear();
    mockStore = createMockStore();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("settings read returns one Result with backgrounds directly in its value", async () => {
    await registerHandlers(mockStore);
    const handler = ipcHandlers.get("settings:read");

    expect(handler).toBeDefined();
    const result = await handler?.(trustedEvent(), {});

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it("settings write rejects arrays and null", async () => {
    await registerHandlers(mockStore);
    const handler = ipcHandlers.get("settings:write");

    await expect(handler?.(trustedEvent(), [])).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    await expect(handler?.(trustedEvent(), null)).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expect(mockStore.write).not.toHaveBeenCalled();
  });

  it("settings write keeps unknown keys", async () => {
    await registerHandlers(mockStore);
    const handler = ipcHandlers.get("settings:write");

    await expect(
      handler?.(trustedEvent(), { futureOption: { density: "compact" } }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(mockStore.write).toHaveBeenCalledWith(expect.objectContaining({
      futureOption: { density: "compact" },
    }));
  });
});
