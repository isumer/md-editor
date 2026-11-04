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

class FakePort {
  readonly messages: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  start = vi.fn();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  reply(message: unknown): void {
    this.onmessage?.({ data: message });
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.invoke.mockResolvedValue({ ok: true, value: null });
});

async function loadPreload() {
  const module = await import("../../src/preload/preload");
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  const portListener = electron.on.mock.calls.find(([channel]) => channel === "io:port")?.[1];
  if (!api || !portListener) {
    throw new Error("preload did not expose its API and port listener");
  }
  return { api, IoPortClient: module.IoPortClient, portListener };
}

describe("preload bridge", () => {
  it("AC-R5-01 AC-R5-02 AC-SEC-01 AC-SEC-11: exposes only the fixed named asynchronous API", async () => {
    const { api, portListener } = await loadPreload();
    expect(electron.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(electron.exposeInMainWorld.mock.calls[0]?.[0]).toBe("api");
    expect(Object.keys(api).sort()).toMatchInlineSnapshot(`
      [
        "chooseSaveTarget",
        "onMenuCommand",
        "onOpenRequest",
        "openExternal",
        "openFile",
        "readDocument",
        "readyForOpenRequests",
        "releaseDocument",
        "writeDocument",
      ]
    `);

    await api.openFile();
    await api.chooseSaveTarget({ grant: "grant-a" });
    await api.releaseDocument({ grant: "grant-a" });
    await api.openExternal("https://example.com");
    await api.readyForOpenRequests();
    expect(electron.invoke.mock.calls).toEqual([
      ["file:open", {}],
      ["file:choose-save-target", { grant: "grant-a" }],
      ["file:release-document", { grant: "grant-a" }],
      ["link:open-external", { url: "https://example.com" }],
      ["file:open-requests-ready", {}],
    ]);

    const port = new FakePort();
    portListener({ ports: [port] });
    const read = api.readDocument("grant-a");
    const write = api.writeDocument({ grant: "grant-a", text: "text" });
    expect(port.messages).toEqual([
      { id: "io-1", op: "read", grant: "grant-a" },
      { id: "io-2", op: "write", grant: "grant-a", text: "text" },
    ]);
    port.reply({
      id: "io-1",
      result: { ok: true, value: { name: "note.md", text: "opened" } },
    });
    port.reply({
      id: "io-2",
      result: { ok: true, value: { name: "note.md" } },
    });
    await expect(read).resolves.toMatchObject({ ok: true, value: { text: "opened" } });
    await expect(write).resolves.toMatchObject({ ok: true, value: { name: "note.md" } });
  });

  it("AC-R5-17: fails pending requests when a replacement port arrives", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const first = new FakePort();
    const replacement = new FakePort();
    client.attach(first);
    const pending = client.request({ op: "write", grant: "grant", text: "pending" });

    client.attach(replacement);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        code: "WORKER_RESTARTED",
        messageKey: "file.workerRestarted",
        retryable: true,
      },
    });
    expect(first.close).toHaveBeenCalledOnce();
  });

  it("AC-R5-17: queues requests until the first port arrives", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const pending = client.request({ op: "read", grant: "grant" });
    const port = new FakePort();

    client.attach(port);

    expect(port.messages).toEqual([{ id: "io-1", op: "read", grant: "grant" }]);
    port.reply({
      id: "io-1",
      result: { ok: true, value: { name: "note.md", text: "opened" } },
    });
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it("AC-SEC-12: ignores malformed and unmatched replies until the real one arrives", async () => {
    const { IoPortClient, portListener } = await loadPreload();
    portListener({ ports: [] });
    const client = new IoPortClient();
    const port = new FakePort();
    client.attach(port);
    const pending = client.request({ op: "read", grant: "grant" });
    const settled = vi.fn();
    void pending.then(settled);
    const getter = { result: { ok: true, value: {} } };
    Object.defineProperty(getter, "id", { enumerable: true, get: () => "io-1" });

    for (const reply of [
      null,
      [],
      "io-1",
      { id: "io-1" },
      { id: "io-1", result: null, extra: true },
      { id: 1, result: { ok: true } },
      { id: "io-1", result: "ok" },
      getter,
      new Proxy({}, { ownKeys: () => { throw new Error("hostile proxy"); } }),
      { id: "io-unknown", result: { ok: true, value: {} } },
    ]) {
      port.reply(reply);
    }
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    port.reply({ id: "io-1", result: { ok: true, value: { name: "a.md", text: "a" } } });
    await expect(pending).resolves.toEqual({ ok: true, value: { name: "a.md", text: "a" } });
  });

  it("AC-SEC-11: forwards only fixed menu and open-request subscriptions", async () => {
    const { api } = await loadPreload();
    const listener = vi.fn();
    const unsubscribe = api.onMenuCommand(listener);
    const menuCall = electron.on.mock.calls.find(([channel]) => channel === "menu:command");
    menuCall?.[1]({}, "save");
    expect(listener).toHaveBeenCalledWith("save");
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith("menu:command", menuCall?.[1]);

    const openListener = vi.fn();
    const unsubscribeOpen = api.onOpenRequest(openListener);
    const openCall = electron.on.mock.calls.find(
      ([channel]) => channel === "file:open-request",
    );
    const request = { ok: true, value: { grant: "grant-open", name: "open.md" } };
    openCall?.[1]({}, request);
    expect(openListener).toHaveBeenCalledWith(request);
    unsubscribeOpen();
    expect(electron.removeListener).toHaveBeenCalledWith(
      "file:open-request",
      openCall?.[1],
    );
  });
});
