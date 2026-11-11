import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Settings } from "../../src/shared/settings/settings";
import { normalizeSettings, DEFAULT_SETTINGS } from "../../src/shared/settings/settings";

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

function createMockStore() {
  return {
    read: vi.fn(() => Promise.resolve({} as Settings)),
    write: vi.fn((_: Settings) => Promise.resolve()),
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

  it("registers read and write handlers", async () => {
    const { registerSettingsIpcHandler } = await import("../../src/main/ipc/settings");
    registerSettingsIpcHandler(mockStore);

    expect(mockIpcMain.handle).toHaveBeenCalledTimes(2);

    const readCall = mockIpcMain.handle.mock.calls.find((c) => c[0] === "settings:read");
    const writeCall = mockIpcMain.handle.mock.calls.find((c) => c[0] === "settings:write");

    expect(readCall).toBeDefined();
    expect(writeCall).toBeDefined();
  });

  it("read handler function exists and is callable", async () => {
    const { registerSettingsIpcHandler } = await import("../../src/main/ipc/settings");
    registerSettingsIpcHandler(mockStore);

    const readCall = mockIpcMain.handle.mock.calls.find((c) => c[0] === "settings:read");
    const action = readCall?.[1];
    expect(typeof action).toBe("function");
    expect(mockIpcMain.handle).toHaveBeenCalledWith("settings:read", expect.any(Function));
  });

  it("write handler function exists and is callable", async () => {
    mockStore.write.mockResolvedValue(undefined);

    const { registerSettingsIpcHandler } = await import("../../src/main/ipc/settings");
    registerSettingsIpcHandler(mockStore);

    const writeCall = mockIpcMain.handle.mock.calls.find((c) => c[0] === "settings:write");
    const action = writeCall?.[1];
    expect(typeof action).toBe("function");
    expect(mockIpcMain.handle).toHaveBeenCalledWith("settings:write", expect.any(Function));
  });
});