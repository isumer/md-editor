import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async (): Promise<{ ok: boolean; value: unknown }> => ({ ok: true, value: null })),
  on: vi.fn(),
  removeListener: vi.fn(),
  filePath: vi.fn(() => "/tmp/dropped.md"),
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
  webUtils: { getPathForFile: electron.filePath },
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

interface DropEvent {
  readonly isTrusted: boolean;
  readonly dataTransfer: { readonly files: ArrayLike<File> } | null;
  preventDefault(): void;
}

const dropListeners = new Map<string, (event: DropEvent) => void>();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.invoke.mockResolvedValue({ ok: true, value: null });
  dropListeners.clear();
  (globalThis as unknown as {
    addEventListener: (type: string, listener: (event: DropEvent) => void) => void;
  }).addEventListener = (type, listener) => {
    dropListeners.set(type, listener);
  };
});

async function loadPreload() {
  const module = await import("../../src/preload/preload");
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1];
  const portListener = electron.on.mock.calls.find(([channel]) => channel === "io:port")?.[1];
  const portLostListener = electron.on.mock.calls.find(
    ([channel]) => channel === "io:port-lost",
  )?.[1];
  if (!api || !portListener) {
    throw new Error("preload did not expose its API and port listener");
  }
  return { api, IoPortClient: module.IoPortClient, portListener, portLostListener };
}

describe("preload bridge", () => {
  it("AC-R5-01 AC-R5-02 AC-SEC-01 AC-SEC-11: exposes only the fixed named asynchronous API", async () => {
    const { api, portListener } = await loadPreload();
    expect(electron.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(electron.exposeInMainWorld.mock.calls[0]?.[0]).toBe("api");
    expect(Object.keys(api).sort()).toMatchInlineSnapshot(`
      [
        "attachDocument",
        "chooseSaveTarget",
        "clearDraft",
        "contributeMenu",
        "detachDocument",
        "draftDocument",
        "listDrafts",
        "loadSession",
        "onMenuCommand",
        "onOpenRequest",
        "onSessionCloseRequest",
        "openExternal",
        "openFile",
        "readDocument",
        "readyForOpenRequests",
        "releaseDocument",
        "respondSessionClose",
        "saveDocument",
        "sendChanges",
      ]
    `);
    expect(api).not.toHaveProperty("openPath");
    expect(api).not.toHaveProperty("pathForFile");

    await api.openFile();
    await api.chooseSaveTarget({ grant: "grant-a" });
    await api.releaseDocument({ grant: "grant-a" });
    await api.openExternal("https://example.com");
    await api.readyForOpenRequests();
    await api.loadSession();
    await api.respondSessionClose({ allow: true, documents: [], id: 1 });
    await api.contributeMenu({
      fileMenuTitle: "File",
      items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }],
    });
    expect(electron.invoke.mock.calls).toEqual([
      ["file:open", {}],
      ["file:choose-save-target", { grant: "grant-a" }],
      ["file:release-document", { grant: "grant-a" }],
      ["link:open-external", { url: "https://example.com" }],
      ["file:open-requests-ready", {}],
      ["session:load", {}],
      ["session:close-result", { allow: true, documents: [], id: 1 }],
      ["menu:contribute", {
        fileMenuTitle: "File",
        items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }],
      }],
    ]);

    const port = new FakePort();
    portListener({ ports: [port] });
    const read = api.readDocument("grant-a");
    const attach = api.attachDocument({
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "text",
    });
    api.sendChanges({
      docId: "doc",
      epoch: 1,
      fromVersion: 0,
      toVersion: 1,
      changes: [4, [0, "!"]],
    });
    const save = api.saveDocument({
      grant: "grant-a",
      docId: "doc",
      epoch: 1,
      version: 1,
    });
    api.detachDocument({ docId: "doc" });
    expect(port.messages).toEqual([
      { id: "io-1", op: "read", grant: "grant-a" },
      { id: "io-2", op: "attach", docId: "doc", epoch: 1, version: 0, text: "text" },
      {
        op: "change",
        docId: "doc",
        epoch: 1,
        fromVersion: 0,
        toVersion: 1,
        changes: [4, [0, "!"]],
      },
      {
        id: "io-3",
        op: "save",
        grant: "grant-a",
        docId: "doc",
        epoch: 1,
        version: 1,
      },
      { op: "detach", docId: "doc" },
    ]);
    port.reply({
      id: "io-1",
      result: { ok: true, value: { canonicalPath: "/tmp/note.md", name: "note.md", text: "opened" } },
    });
    port.reply({
      id: "io-2",
      result: { ok: true, value: {} },
    });
    port.reply({
      id: "io-3",
      result: { ok: true, value: { name: "note.md", version: 1 } },
    });
    await expect(read).resolves.toMatchObject({ ok: true, value: { text: "opened" } });
    await expect(attach).resolves.toMatchObject({ ok: true, value: {} });
    await expect(save).resolves.toMatchObject({
      ok: true,
      value: { name: "note.md", version: 1 },
    });
  });

  it("AC-SEC-09: opens only files from a trusted drop, through the preload", async () => {
    const { api } = await loadPreload();
    const opened: unknown[] = [];
    api.onOpenRequest((request: unknown) => {
      opened.push(request);
    });
    const listener = dropListeners.get("drop");
    expect(listener).toBeDefined();
    const file = { name: "dropped.md" } as unknown as File;

    // A page-created drop is not trusted: it must not reach the main process.
    const untrusted = {
      isTrusted: false,
      dataTransfer: { files: [file] },
      preventDefault: vi.fn(),
    };
    listener?.(untrusted);
    await Promise.resolve();
    expect(electron.invoke).not.toHaveBeenCalled();
    expect(untrusted.preventDefault).not.toHaveBeenCalled();

    const empty = {
      isTrusted: true,
      dataTransfer: null,
      preventDefault: vi.fn(),
    };
    listener?.(empty);
    await Promise.resolve();
    expect(electron.invoke).not.toHaveBeenCalled();
    expect(empty.preventDefault).toHaveBeenCalledOnce();

    // A real drop reaches main as a path and reports the result to the renderer.
    const reference = {
      canonicalPath: "/tmp/dropped.md",
      grant: "grant-d",
      name: "dropped.md",
    };
    electron.invoke.mockResolvedValueOnce({ ok: true, value: reference });
    const trusted = {
      isTrusted: true,
      dataTransfer: { files: [file] },
      preventDefault: vi.fn(),
    };
    listener?.(trusted);

    await vi.waitFor(() => {
      expect(opened).toEqual([{ ok: true, value: reference }]);
    });
    expect(trusted.preventDefault).toHaveBeenCalledOnce();
    expect(electron.invoke).toHaveBeenCalledWith(
      "file:open-path",
      { path: "/tmp/dropped.md" },
    );
  });

  it("AC-R5-17: fails pending requests when a replacement port arrives", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const first = new FakePort();
    const replacement = new FakePort();
    client.attach(first);
    const pending = client.request({
      op: "save",
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 0,
    });

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

  it("AC-R5-17: posts a request queued after port loss on the replacement port", async () => {
    const { api, portListener, portLostListener } = await loadPreload();
    const first = new FakePort();
    const replacement = new FakePort();
    portListener({ ports: [first] });
    expect(portLostListener).toBeDefined();
    portLostListener?.({});

    const saved = api.saveDocument({
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
    });
    portListener({ ports: [replacement] });

    expect(first.messages).toEqual([]);
    expect(replacement.messages).toEqual([{
      id: "io-1",
      op: "save",
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
    }]);
    replacement.reply({
      id: "io-1",
      result: { ok: true, value: { name: "note.md", version: 1 } },
    });
    await expect(saved).resolves.toMatchObject({ ok: true, value: { version: 1 } });
  });

  it("AC-R5-17: a second port loss keeps a message queued after the first", async () => {
    const { api, portListener, portLostListener } = await loadPreload();
    const first = new FakePort();
    portListener({ ports: [first] });
    portLostListener?.({});
    api.sendChanges({
      docId: "doc",
      epoch: 1,
      fromVersion: 0,
      toVersion: 1,
      changes: [4, [0, "!"]],
    });

    portLostListener?.({});

    const replacement = new FakePort();
    portListener({ ports: [replacement] });
    expect(replacement.messages).toEqual([{
      op: "change",
      docId: "doc",
      epoch: 1,
      fromVersion: 0,
      toVersion: 1,
      changes: [4, [0, "!"]],
    }]);
  });

  it("AC-R5-17: port loss fails a request pending on the old port", async () => {
    const { api, portListener, portLostListener } = await loadPreload();
    const first = new FakePort();
    portListener({ ports: [first] });
    expect(portLostListener).toBeDefined();
    const saved = api.saveDocument({
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
    });

    portLostListener?.({});

    await expect(saved).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKER_RESTARTED", retryable: true },
    });
    expect(first.close).toHaveBeenCalledOnce();
  });

  it("AC-R5-17: a failure port settles a request queued after port loss", async () => {
    const { api, portListener, portLostListener } = await loadPreload();
    const first = new FakePort();
    const failure = new FakePort();
    portListener({ ports: [first] });
    expect(portLostListener).toBeDefined();
    portLostListener?.({});
    const saved = api.saveDocument({
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
    });

    portListener({ ports: [failure] });
    failure.reply({
      id: "io-1",
      result: {
        ok: false,
        error: {
          code: "WORKER_RESTARTED",
          messageKey: "file.workerRestarted",
          params: {},
          retryable: true,
        },
      },
    });

    await expect(saved).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKER_RESTARTED", retryable: true },
    });
  });

  it("AC-R5-17: queues requests and one-way messages in one FIFO", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const attached = client.request({
      op: "attach",
      docId: "doc",
      epoch: 0,
      version: 0,
      text: "opened",
    });
    client.send({
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [6, [0, "!"]],
    });
    const saved = client.request({
      op: "save",
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
    });
    client.send({ op: "detach", docId: "doc" });
    const port = new FakePort();

    client.attach(port);

    expect(port.messages).toEqual([
      { id: "io-1", op: "attach", docId: "doc", epoch: 0, version: 0, text: "opened" },
      {
        op: "change",
        docId: "doc",
        epoch: 0,
        fromVersion: 0,
        toVersion: 1,
        changes: [6, [0, "!"]],
      },
      {
        id: "io-2",
        op: "save",
        grant: "grant",
        docId: "doc",
        epoch: 0,
        version: 1,
      },
      { op: "detach", docId: "doc" },
    ]);
    port.reply({
      id: "io-1",
      result: { ok: true, value: {} },
    });
    port.reply({
      id: "io-2",
      result: { ok: true, value: { name: "note.md", version: 1 } },
    });
    await expect(attached).resolves.toMatchObject({ ok: true });
    await expect(saved).resolves.toMatchObject({ ok: true });
  });

  it("AC-R4-07: requests, lists and clears drafts through the port", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const port = new FakePort();
    client.attach(port);

    const drafted = client.request({
      op: "draft",
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 2,
    });
    const listed = client.request({ op: "drafts" });
    client.send({ op: "clear-draft", docId: "doc" });

    expect(port.messages).toEqual([
      { id: "io-1", op: "draft", grant: "grant", docId: "doc", epoch: 0, version: 2 },
      { id: "io-2", op: "drafts" },
      { op: "clear-draft", docId: "doc" },
    ]);

    port.reply({ id: "io-1", result: { ok: true, value: {} } });
    port.reply({
      id: "io-2",
      result: {
        ok: true,
        value: { drafts: [{ docId: "doc", grant: "grant", text: "draft text" }] },
      },
    });
    await expect(drafted).resolves.toMatchObject({ ok: true, value: {} });
    await expect(listed).resolves.toEqual({
      ok: true,
      value: { drafts: [{ docId: "doc", grant: "grant", text: "draft text" }] },
    });
  });

  it("AC-R4-07: drafts, lists and clears through the named API", async () => {
    const { api, portListener } = await loadPreload();
    const port = new FakePort();
    portListener({ ports: [port] });

    const drafted = api.draftDocument({
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 2,
    });
    const listed = api.listDrafts();
    api.clearDraft({ docId: "doc" });

    expect(port.messages).toEqual([
      { id: "io-1", op: "draft", grant: "grant", docId: "doc", epoch: 0, version: 2 },
      { id: "io-2", op: "drafts" },
      { op: "clear-draft", docId: "doc" },
    ]);

    port.reply({ id: "io-1", result: { ok: true, value: {} } });
    port.reply({
      id: "io-2",
      result: { ok: true, value: { drafts: [{ docId: "doc", grant: null, text: "x" }] } },
    });
    await expect(drafted).resolves.toMatchObject({ ok: true, value: {} });
    await expect(listed).resolves.toMatchObject({
      ok: true,
      value: { drafts: [{ docId: "doc", grant: null, text: "x" }] },
    });

    let invalidSettled = false;
    void api.listDrafts().then(() => { invalidSettled = true; });
    port.reply({ id: "io-3", result: { ok: true, value: {} } });
    await Promise.resolve();
    expect(invalidSettled).toBe(false);
  });

  it("AC-PERF-04: sendChanges posts exactly the delta without text", async () => {
    const { api, portListener } = await loadPreload();
    const port = new FakePort();
    portListener({ ports: [port] });

    api.sendChanges({
      docId: "large",
      epoch: 7,
      fromVersion: 10,
      toVersion: 11,
      changes: [20 * 1024 * 1024, [0, "!"]],
    });

    expect(port.messages).toEqual([{
      op: "change",
      docId: "large",
      epoch: 7,
      fromVersion: 10,
      toVersion: 11,
      changes: [20 * 1024 * 1024, [0, "!"]],
    }]);
    expect(port.messages[0]).not.toHaveProperty("text");
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
    const failure = (params: unknown) => ({
      id: "io-1",
      result: {
        ok: false,
        error: {
          code: "NOT_FOUND",
          messageKey: "file.notFound",
          params,
          retryable: false,
        },
      },
    });
    const hostileParams = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile params"); },
    });

    for (const reply of [
      null,
      [],
      "io-1",
      { id: "io-1" },
      { id: "io-1", result: null, extra: true },
      { id: 1, result: { ok: true } },
      { id: "io-1", result: "ok" },
      getter,
      failure(null),
      failure({ [Symbol("file")]: "a.md" }),
      failure(hostileParams),
      new Proxy({}, { ownKeys: () => { throw new Error("hostile proxy"); } }),
      { id: "io-unknown", result: { ok: true, value: {} } },
    ]) {
      port.reply(reply);
    }
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    port.reply({
      id: "io-1",
      result: {
        ok: true,
        value: { canonicalPath: "/tmp/a.md", name: "a.md", text: "a" },
      },
    });
    await expect(pending).resolves.toEqual({
      ok: true,
      value: { canonicalPath: "/tmp/a.md", name: "a.md", text: "a" },
    });
  });

  it("AC-SEC-12: accepts an exact typed failure reply", async () => {
    const { IoPortClient } = await loadPreload();
    const client = new IoPortClient();
    const port = new FakePort();
    client.attach(port);
    const pending = client.request({ op: "read", grant: "missing" });

    port.reply({
      id: "io-1",
      result: {
        ok: false,
        error: {
          code: "NOT_FOUND",
          messageKey: "file.notFound",
          params: { file: "missing.md" },
          retryable: false,
        },
      },
    });

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", params: { file: "missing.md" } },
    });
  });

  it("AC-SEC-11: forwards only fixed menu and open-request subscriptions", async () => {
    const { api } = await loadPreload();
    const listener = vi.fn();
    const unsubscribe = api.onMenuCommand(listener);
    const menuCall = electron.on.mock.calls.find(([channel]) => channel === "menu:command");
    menuCall?.[1]({}, "file-save");
    expect(listener).toHaveBeenCalledWith("file-save");
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

    const closeListener = vi.fn();
    const unsubscribeClose = api.onSessionCloseRequest(closeListener);
    const closeCall = electron.on.mock.calls.find(
      ([channel]) => channel === "session:request-close",
    );
    closeCall?.[1]({}, { id: 5 });
    expect(closeListener).toHaveBeenCalledWith({ id: 5 });
    unsubscribeClose();
    expect(electron.removeListener).toHaveBeenCalledWith(
      "session:request-close",
      closeCall?.[1],
    );
  });
});
