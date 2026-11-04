import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => ({ ok: true, value: null })),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.invoke.mockResolvedValue({ ok: true, value: null });
});

describe("preload bridge", () => {
  it("AC-R5-01 AC-R5-02 AC-SEC-01: exposes only the typed asynchronous API", async () => {
    await import("../../src/preload/preload");
    expect(electron.exposeInMainWorld).toHaveBeenCalledTimes(1);
    const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
    expect(electron.exposeInMainWorld.mock.calls[0]?.[0]).toBe("mdApi");

    await api.openFile();
    await api.saveFile({ path: "/tmp/a.md", text: "a" });
    await api.saveFileAs({ path: null, text: "b" });
    await api.openExternal("https://example.com");
    await api.readyForOpenRequests();
    expect(electron.invoke.mock.calls).toEqual([
      ["file:open"],
      ["file:save", { path: "/tmp/a.md", text: "a" }],
      ["file:save-as", { path: null, text: "b" }],
      ["link:open-external", "https://example.com"],
      ["file:open-requests-ready"],
    ]);

    const listener = vi.fn();
    const unsubscribe = api.onMenuCommand(listener);
    const ipcListener = electron.on.mock.calls[0]?.[1];
    ipcListener({}, "save");
    expect(listener).toHaveBeenCalledWith("save");
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith("menu:command", ipcListener);

    const openListener = vi.fn();
    const unsubscribeOpen = api.onOpenRequest(openListener);
    const openIpcListener = electron.on.mock.calls[1]?.[1];
    const request = { ok: true, value: { path: "/tmp/open.md", text: "open" } };
    openIpcListener({}, request);
    expect(openListener).toHaveBeenCalledWith(request);
    unsubscribeOpen();
    expect(electron.removeListener).toHaveBeenCalledWith(
      "file:open-request",
      openIpcListener,
    );
  });
});
