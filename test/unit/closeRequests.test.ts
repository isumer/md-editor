import { describe, expect, it, vi } from "vitest";

import {
  CloseRequestBroker,
  type TimerHandle,
} from "../../src/main/app/closeRequests";

const result = {
  allow: true,
  documents: [{ grant: "grant", name: "a.md", savedText: "a", text: "b" }],
  id: 1,
} as const;

function broker() {
  const send = vi.fn();
  const persist = vi.fn(async () => undefined);
  const timers = new Map<TimerHandle, () => void>();
  let nextHandle = 1;
  const instance = new CloseRequestBroker(send, persist, {
    timeoutMilliseconds: 15_000,
    setTimer: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, callback);
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle);
    },
  });
  const fireTimeout = (): void => {
    const [handle, callback] = [...timers.entries()][0] ?? [];
    if (handle !== undefined && callback) {
      timers.delete(handle);
      callback();
    }
  };
  return { instance, send, persist, timers, fireTimeout };
}

describe("close request broker", () => {
  it("AC-R4-06: asks the renderer and persists an allowed close", async () => {
    const { instance, send, persist, timers } = broker();

    const pending = instance.request(7);
    expect(send).toHaveBeenCalledWith(7, 1);
    expect(timers.size).toBe(1);

    await instance.settle(result, 7);

    await expect(pending).resolves.toBe(true);
    expect(persist).toHaveBeenCalledWith(result, 7);
    expect(timers.size).toBe(0);
  });

  it("AC-R4-06: a cancelled close resolves false and writes no session", async () => {
    const { instance, persist } = broker();

    const pending = instance.request(7);
    await instance.settle({ ...result, allow: false }, 7);

    await expect(pending).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it("AC-R4-06: an unanswered close times out and never wedges shutdown", async () => {
    const { instance, persist, fireTimeout } = broker();

    const pending = instance.request(7);
    fireTimeout();

    await expect(pending).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("AC-R4-06: ignores a result for a request that already settled", async () => {
    const { instance, persist } = broker();

    await instance.settle(result, 7);

    expect(persist).not.toHaveBeenCalled();
  });

  it("AC-R4-06: uses the system timers when none are injected", async () => {
    const send = vi.fn();
    const persist = vi.fn(async () => undefined);
    const instance = new CloseRequestBroker(send, persist);

    const pending = instance.request(7);
    await instance.settle(result, 7);

    await expect(pending).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(7, 1);
    expect(persist).toHaveBeenCalledWith(result, 7);
  });
});
