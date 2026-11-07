import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  MessageChannelMain: class {},
  utilityProcess: { fork: vi.fn() },
}));

import { GrantTable } from "../../src/main/grants/grantTable";
import { createIoWorkerSupervisor, IoWorkerSupervisor } from "../../src/main/io/ioWorker";

class FakePort extends EventEmitter {
  readonly messages: unknown[] = [];
  close = vi.fn();
  start = vi.fn();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }
}

class FakeChild extends EventEmitter {
  readonly posts: Array<{ message: unknown; ports: unknown[] }> = [];
  kill = vi.fn(() => true);

  postMessage(message: unknown, ports: unknown[] = []): void {
    this.posts.push({ message, ports });
  }
}

function createHarness(grants = new GrantTable()) {
  const children: FakeChild[] = [];
  const channels: Array<{ port1: FakePort; port2: FakePort }> = [];
  const logExit = vi.fn();
  let now = 1_000;
  const supervisor = new IoWorkerSupervisor(grants, {
    fork: () => {
      const child = new FakeChild();
      children.push(child);
      return child as never;
    },
    createChannel: () => {
      const channel = { port1: new FakePort(), port2: new FakePort() };
      channels.push(channel);
      return channel as never;
    },
    now: () => now,
    logExit,
  });
  return {
    channels,
    children,
    grants,
    logExit,
    supervisor,
    setNow(value: number) { now = value; },
  };
}

function registerMessage(child: FakeChild) {
  return child.posts.find(({ message }) =>
    (message as { type?: string }).type === "registerGrant")?.message as
    | { id: string; handle: string; path: string; type: string }
    | undefined;
}

function acknowledge(child: FakeChild, message: { id: string; path: string }): void {
  child.emit("message", {
    id: message.id,
    result: {
      ok: true,
      value: { canonicalPath: message.path, name: "note.md" },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("io-worker supervisor", () => {
  it("AC-R5-17: replays grants before re-issuing renderer ports", async () => {
    const grants = new GrantTable();
    const handle = grants.issue(7, "/documents/note.md", "document");
    const harness = createHarness(grants);
    const received: FakePort[] = [];
    harness.supervisor.start();
    const firstChild = harness.children[0];
    firstChild?.emit("spawn");
    await harness.supervisor.attachWindow(7, (port) => received.push(port as never));
    expect(firstChild?.posts[0]?.message).toEqual({ type: "attachPort", windowId: 7 });

    firstChild?.emit("exit", 9);
    const replacement = harness.children[1];
    replacement?.emit("spawn");
    await vi.waitFor(() => expect(registerMessage(replacement as FakeChild)).toBeDefined());
    const registration = registerMessage(replacement as FakeChild);
    expect(registration).toMatchObject({
      type: "registerGrant",
      handle,
      path: "/documents/note.md",
    });
    expect(replacement?.posts).toHaveLength(1);
    acknowledge(replacement as FakeChild, registration as { id: string; path: string });

    await vi.waitFor(() => expect(replacement?.posts).toHaveLength(2));
    expect(replacement?.posts[1]?.message).toEqual({ type: "attachPort", windowId: 7 });
    expect(received).toHaveLength(2);
    expect(harness.logExit).toHaveBeenCalledWith(9, null);
  });

  it("AC-R5-17: signals a lost port before each receiver gets its replacement", async () => {
    const harness = createHarness();
    const events: string[] = [];
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    await harness.supervisor.attachWindow(
      3,
      () => events.push("port-3"),
      () => events.push("lost-3"),
    );
    await harness.supervisor.attachWindow(
      4,
      () => events.push("port-4"),
      () => events.push("lost-4"),
    );

    harness.children[0]?.emit("exit", 9);
    harness.children[1]?.emit("spawn");
    await vi.waitFor(() => expect(events).toEqual([
      "port-3",
      "port-4",
      "lost-3",
      "lost-4",
      "port-3",
      "port-4",
    ]));
  });

  it("AC-R5-17: a failing lost signal does not stop the restart", async () => {
    const harness = createHarness();
    const events: string[] = [];
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    await harness.supervisor.attachWindow(3, () => events.push("port-3"), () => {
      throw new Error("webContents destroyed");
    });
    await harness.supervisor.attachWindow(4, () => events.push("port-4"), () => events.push("lost-4"));

    harness.children[0]?.emit("exit", 9);
    harness.children[1]?.emit("spawn");
    await vi.waitFor(() => expect(events).toEqual([
      "port-3",
      "port-4",
      "lost-4",
      "port-3",
      "port-4",
    ]));
  });

  it("AC-R5-17: fails an in-flight registration when the worker exits", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0];
    child?.emit("spawn");
    const registration = harness.supervisor.registerGrant(
      1,
      "grant",
      "/documents/note.md",
      true,
    );
    await vi.waitFor(() => expect(child?.posts).toHaveLength(1));

    child?.emit("exit", 9);

    await expect(registration).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKER_RESTARTED", retryable: true },
    });
  });

  it("AC-SEC-17: resolves an asset through the worker and validates the reply", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");

    const resolution = harness.supervisor.resolveAsset(7, "grant", "images/pic.png");
    await vi.waitFor(() => expect(child.posts).toHaveLength(1));
    const request = child.posts[0]?.message as {
      id: string;
      type: string;
      windowId: number;
      grant: string;
      relativePath: string;
    };
    expect(request).toMatchObject({
      type: "resolveAsset",
      windowId: 7,
      grant: "grant",
      relativePath: "images/pic.png",
    });

    child.emit("message", {
      id: request.id,
      result: { ok: true, value: { path: "/documents/images/pic.png" } },
    });

    await expect(resolution).resolves.toEqual({
      ok: true,
      value: { path: "/documents/images/pic.png" },
    });
  });

  it("AC-SEC-17: rejects a malformed asset reply as a bad request", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");
    const resolution = harness.supervisor.resolveAsset(7, "grant", "pic.png");
    await vi.waitFor(() => expect(child.posts).toHaveLength(1));
    const request = child.posts[0]?.message as { id: string };

    child.emit("message", { id: request.id, result: { ok: true, value: {} } });

    await expect(resolution).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
  });

  it("AC-SEC-17: a stopped supervisor refuses asset resolution", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    harness.supervisor.stop();

    await expect(harness.supervisor.resolveAsset(7, "grant", "pic.png"))
      .resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED" } });
  });

  it("AC-R4-08: reads the session through the worker and validates the reply", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");

    const reading = harness.supervisor.readSession("/profiles/session.json");
    await vi.waitFor(() => expect(child.posts).toHaveLength(1));
    const request = child.posts[0]?.message as { id: string; type: string; path: string };
    expect(request).toMatchObject({ type: "readSession", path: "/profiles/session.json" });

    child.emit("message", {
      id: request.id,
      result: { ok: true, value: { version: 1, documents: [] } },
    });
    await expect(reading).resolves.toEqual({
      ok: true,
      value: { version: 1, documents: [] },
    });

    const rejected = harness.supervisor.readSession("/profiles/session.json");
    await vi.waitFor(() => expect(child.posts).toHaveLength(2));
    const invalid = child.posts[1]?.message as { id: string };
    child.emit("message", { id: invalid.id, result: { ok: true, value: {} } });
    await expect(rejected).resolves.toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
  });

  it("AC-R4-08: writes the session through the worker and validates the reply", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");
    const session = {
      documents: [{
        name: "note.md",
        path: "/docs/note.md",
        savedText: "old",
        text: "new",
      }],
      version: 1 as const,
    };

    const writing = harness.supervisor.writeSession("/profiles/session.json", session);
    await vi.waitFor(() => expect(child.posts).toHaveLength(1));
    const request = child.posts[0]?.message as {
      id: string;
      type: string;
      path: string;
      session: unknown;
    };
    expect(request).toMatchObject({
      type: "writeSession",
      path: "/profiles/session.json",
      session,
    });

    child.emit("message", { id: request.id, result: { ok: true, value: {} } });
    await expect(writing).resolves.toEqual({ ok: true, value: {} });
  });

  it("AC-R4-08: a stopped supervisor refuses session access", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    harness.supervisor.stop();

    await expect(harness.supervisor.readSession("/profiles/session.json"))
      .resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED" } });
    await expect(harness.supervisor.writeSession("/profiles/session.json", {
      documents: [],
      version: 1,
    })).resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED" } });
  });

  it("AC-R5-17: stops after five restarts in sixty seconds", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");

    for (let restart = 0; restart < 5; restart += 1) {
      harness.children[restart]?.emit("exit", 9);
      await vi.waitFor(() => expect(harness.children).toHaveLength(restart + 2));
      harness.children[restart + 1]?.emit("spawn");
      await Promise.resolve();
    }
    harness.children[5]?.emit("exit", 9);
    await Promise.resolve();

    expect(harness.children).toHaveLength(6);
    expect(harness.logExit).toHaveBeenCalledTimes(6);
  });

  it("AC-R5-17: a stopped supervisor gives future ports typed failures", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    for (let restart = 0; restart < 5; restart += 1) {
      harness.children[restart]?.emit("exit", 9);
      await vi.waitFor(() => expect(harness.children).toHaveLength(restart + 2));
      harness.children[restart + 1]?.emit("spawn");
      await Promise.resolve();
    }
    harness.children[5]?.emit("exit", 9);
    const received: FakePort[] = [];

    await harness.supervisor.attachWindow(1, (port) => received.push(port as never));
    const failurePort = harness.channels.at(-1)?.port1;
    failurePort?.emit("message", { data: { id: "io-1", op: "read", grant: "grant" } });

    expect(received).toHaveLength(1);
    expect(failurePort?.messages).toEqual([{
      id: "io-1",
      result: {
        ok: false,
        error: expect.objectContaining({ code: "WORKER_RESTARTED" }),
      },
    }]);
  });
});

async function exhaustRestarts(harness: ReturnType<typeof createHarness>): Promise<void> {
  harness.children[0]?.emit("spawn");
  for (let restart = 0; restart < 5; restart += 1) {
    harness.children[restart]?.emit("exit", 9);
    await vi.waitFor(() => expect(harness.children).toHaveLength(restart + 2));
    harness.children[restart + 1]?.emit("spawn");
    await Promise.resolve();
  }
  harness.children[5]?.emit("exit", 9);
}

describe("io-worker supervisor lifecycle", () => {
  it("AC-R5-17: starts once and a stop neither restarts nor leaves registrations waiting", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");
    const registration = harness.supervisor.registerGrant(1, "grant", "/documents/a.md", true);
    await vi.waitFor(() => expect(child.posts).toHaveLength(1));

    harness.supervisor.stop();
    child.emit("exit", 0);

    await expect(registration).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKER_RESTARTED" },
    });
    expect(child.kill).toHaveBeenCalledOnce();
    expect(harness.children).toHaveLength(1);
    expect(harness.logExit).not.toHaveBeenCalled();
    await expect(harness.supervisor.registerGrant(1, "later", "/documents/b.md", true))
      .resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED" } });
  });

  it("AC-R5-17: a child that exits before spawning does not leave callers waiting", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const registration = harness.supervisor.registerGrant(1, "grant", "/documents/a.md", true);

    harness.children[0]?.emit("exit", 1);

    await vi.waitFor(() => expect(harness.children[1]?.posts).toHaveLength(1));
    const replacement = harness.children[1] as FakeChild;
    acknowledge(replacement, registerMessage(replacement) as { id: string; path: string });
    await expect(registration).resolves.toMatchObject({
      ok: true,
      value: { canonicalPath: "/documents/a.md" },
    });
  });

  it("AC-R5-17: an unspawned replacement cannot issue a stale port", async () => {
    const harness = createHarness();
    const received: FakePort[] = [];
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    await harness.supervisor.attachWindow(7, (port) => received.push(port as never));

    harness.children[0]?.emit("exit", 1);
    harness.children[1]?.emit("exit", 1);

    expect(received).toHaveLength(1);
    harness.children[2]?.emit("spawn");
    await vi.waitFor(() => expect(received).toHaveLength(2));
  });

  it("AC-SEC-07: settles registrations only from valid replies and keeps typed failures", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");
    const invalid = harness.supervisor.registerGrant(1, "a", "/documents/a.md", true);
    const refused = harness.supervisor.registerGrant(1, "b", "/documents/b.md", true);
    await vi.waitFor(() => expect(child.posts).toHaveLength(2));
    const [first, second] = child.posts.map(({ message }) => message as { id: string });

    child.emit("message", { result: "no id" });
    child.emit("message", { id: "control-unknown", result: { ok: true } });
    child.emit("message", { id: first?.id, result: { ok: true, value: {} } });
    child.emit("message", {
      id: second?.id,
      result: {
        ok: false,
        error: {
          code: "NOT_FOUND",
          messageKey: "file.notFound",
          params: { file: "b.md" },
          retryable: false,
        },
      },
    });

    await expect(invalid).resolves.toEqual({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        messageKey: "request.invalid",
        params: {},
        retryable: false,
      },
    });
    await expect(refused).resolves.toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "file.notFound",
        params: { file: "b.md" },
        retryable: false,
      },
    });
  });

  it("AC-R5-17: restarts older than sixty seconds no longer count", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    for (let restart = 0; restart < 5; restart += 1) {
      harness.children[restart]?.emit("exit", 9);
      await vi.waitFor(() => expect(harness.children).toHaveLength(restart + 2));
      harness.children[restart + 1]?.emit("spawn");
      await Promise.resolve();
    }

    harness.setNow(1_000 + 60_000);
    harness.children[5]?.emit("exit", 9);

    await vi.waitFor(() => expect(harness.children).toHaveLength(7));
  });

  it("AC-R5-17: past the restart limit every attached window gets a failing port", async () => {
    const harness = createHarness();
    const received: FakePort[] = [];
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    await harness.supervisor.attachWindow(3, (port) => received.push(port as never));

    await exhaustRestarts(harness);
    const failurePort = harness.channels.at(-1)?.port1 as FakePort;
    failurePort.emit("message", { data: { op: "read" } });
    failurePort.emit("message", { data: { id: "io-2", op: "save" } });

    expect(received.at(-1)).toBe(harness.channels.at(-1)?.port2);
    expect(failurePort.messages).toEqual([{
      id: "io-2",
      result: {
        ok: false,
        error: {
          code: "WORKER_RESTARTED",
          messageKey: "file.workerRestarted",
          params: {},
          retryable: true,
        },
      },
    }]);
    await expect(harness.supervisor.registerGrant(3, "grant", "/documents/a.md", true))
      .resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED" } });
  });

  it("AC-R5-17: a replay interrupted by another exit waits for the current replay", async () => {
    const grants = new GrantTable();
    grants.issue(7, "/documents/a.md", "document");
    grants.issue(7, "/documents/b.md", "document");
    const harness = createHarness(grants);
    const received: FakePort[] = [];
    harness.supervisor.start();
    harness.children[0]?.emit("spawn");
    await harness.supervisor.attachWindow(7, (port) => received.push(port as never));

    harness.children[0]?.emit("exit", 9);
    harness.children[1]?.emit("spawn");
    await vi.waitFor(() => expect(registerMessage(harness.children[1] as FakeChild)).toBeDefined());
    harness.children[1]?.emit("exit", 9);
    harness.children[2]?.emit("spawn");

    await vi.waitFor(() => expect(harness.children[2]?.posts).toHaveLength(1));
    expect(received).toHaveLength(1);
    const replacement = harness.children[2] as FakeChild;
    acknowledge(replacement, replacement.posts[0]?.message as { id: string; path: string });
    await vi.waitFor(() => expect(replacement.posts).toHaveLength(2));
    expect(received).toHaveLength(1);
    acknowledge(replacement, replacement.posts[1]?.message as { id: string; path: string });
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(replacement.posts[2]?.message).toEqual({ type: "attachPort", windowId: 7 });
    expect(harness.children[1]?.posts.map(({ message }) => (message as { type: string }).type))
      .toEqual(["registerGrant"]);
  });

  it("AC-R5-17: a registration that cannot be posted fails with a retryable error", async () => {
    const harness = createHarness();
    harness.supervisor.start();
    const child = harness.children[0] as FakeChild;
    child.emit("spawn");
    child.postMessage = () => {
      throw new Error("channel closed");
    };

    await expect(harness.supervisor.registerGrant(1, "grant", "/documents/a.md", true))
      .resolves.toMatchObject({ ok: false, error: { code: "WORKER_RESTARTED", retryable: true } });
  });

  it("AC-R5-17: the Electron supervisor forks the io-worker by service name", async () => {
    const { utilityProcess } = await import("electron");
    const child = new FakeChild();
    vi.mocked(utilityProcess.fork).mockReturnValue(child as never);
    const logExit = vi.fn();
    const supervisor = createIoWorkerSupervisor("/app/io-worker/main.js", new GrantTable(), logExit);

    supervisor.start();
    child.emit("spawn");
    child.emit("exit", 3);

    expect(utilityProcess.fork).toHaveBeenCalledWith(
      "/app/io-worker/main.js",
      [],
      { serviceName: "io-worker" },
    );
    expect(logExit).toHaveBeenCalledWith(3, null);
  });
});
