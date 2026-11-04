import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  MessageChannelMain: class {},
  utilityProcess: { fork: vi.fn() },
}));

import { GrantTable } from "../../src/main/grants/grantTable";
import { IoWorkerSupervisor } from "../../src/main/io/ioWorker";

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
