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
  const timerDurations: number[] = [];
  let nextHandle = 1;
  const instance = new CloseRequestBroker(send, persist, {
    ackTimeoutMilliseconds: 4_000,
    keepaliveTimeoutMilliseconds: 15_000,
    setTimer: (callback, milliseconds) => {
      timerDurations.push(milliseconds);
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
  return { instance, send, persist, timers, fireTimeout, timerDurations };
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

  it("AC-SEC-07: only the window that received a close request can settle it", async () => {
    const { instance, persist, timers } = broker();
    const pending = instance.request(1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await instance.settle(result, 2);
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);

    await instance.settle(result, 1);
    await expect(pending).resolves.toBe(true);
    expect(persist).toHaveBeenCalledWith(result, 1);
  });

  it("AC-R4-06: an unanswered close times out and never wedges shutdown", async () => {
    const { instance, persist, fireTimeout } = broker();

    const pending = instance.request(7);
    fireTimeout();

    await expect(pending).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("AC-R4-06: an acknowledged open prompt stays pending after 15 seconds", async () => {
    const { instance, persist, timers, fireTimeout, timerDurations } = broker();
    const pending = instance.request(7);
    const initialTimeout = [...timers.values()][0];
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await instance.settle({
      allow: false,
      documents: [{
        grant: "session-close:keepalive",
        name: "",
        savedText: "",
        text: "",
      }],
      id: 1,
    }, 7);
    if (!initialTimeout) {
      throw new Error("The close timeout was not scheduled");
    }
    initialTimeout();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);
    // The keepalive moves the deadline above the renderer's 5 s interval, so an
    // open prompt cannot time out between two keepalives.
    expect(timerDurations).toEqual([4_000, 15_000]);

    fireTimeout();
    await expect(pending).resolves.toBe(true);
  });

  it("AC-R4-06: ignores a result for a request that already settled", async () => {
    const { instance, persist } = broker();

    const pending = instance.request(7);
    await instance.settle(result, 7);
    await expect(pending).resolves.toBe(true);
    await instance.settle(result, 7);

    expect(persist).toHaveBeenCalledOnce();
  });

  it("AC-R4-06: a failed session write still lets the close finish", async () => {
    const send = vi.fn();
    const persist = vi.fn(async () => {
      throw new Error("disk full");
    });
    const instance = new CloseRequestBroker(send, persist);

    const pending = instance.request(7);
    await expect(instance.settle(result, 7)).rejects.toThrow("disk full");
    await expect(pending).resolves.toBe(true);
  });

  it("AC-R4-06: a stalled session write cannot wedge shutdown", async () => {
    let finishPersist: (() => void) | undefined;
    const timerDurations: number[] = [];
    const persist = vi.fn(() => new Promise<void>((resolve) => {
      finishPersist = resolve;
    }));
    const timers = new Map<TimerHandle, () => void>();
    const instance = new CloseRequestBroker(vi.fn(), persist, {
      setTimer: (callback, milliseconds) => {
        timerDurations.push(milliseconds);
        timers.set(1, callback);
        return 1;
      },
      clearTimer: (handle) => {
        timers.delete(handle);
      },
    });
    const pending = instance.request(7);
    const settling = instance.settle(result, 7);
    await Promise.resolve();

    expect(timers.size).toBe(1);
    expect(timerDurations).toEqual([4_000, 5_000]);
    timers.get(1)?.();
    await expect(settling).resolves.toBeUndefined();
    await expect(pending).resolves.toBe(true);
    finishPersist?.();
  });

  it("AC-R4-06: a late ack and a stalled session write fit inside the e2e test budget", async () => {
    let finishPersist: (() => void) | undefined;
    const durations: number[] = [];
    const timers = new Map<TimerHandle, () => void>();
    let nextHandle = 1;
    const persist = vi.fn(() => new Promise<void>((resolve) => {
      finishPersist = resolve;
    }));
    const instance = new CloseRequestBroker(vi.fn(), persist, {
      setTimer: (callback, milliseconds) => {
        durations.push(milliseconds);
        const handle = nextHandle;
        nextHandle += 1;
        timers.set(handle, callback);
        return handle;
      },
      clearTimer: (handle) => {
        timers.delete(handle);
      },
    });
    const pending = instance.request(7);
    const settling = instance.settle(result, 7);
    await Promise.resolve();

    // The ack can arrive at the last millisecond of its window, then the write
    // gets its own full deadline. Their sum is the worst case before the window
    // close and the process exit, so it must leave room inside the 15 s budget.
    expect(durations.reduce((sum, milliseconds) => sum + milliseconds, 0))
      .toBeLessThan(10_000);

    finishPersist?.();
    await expect(settling).resolves.toBeUndefined();
    await expect(pending).resolves.toBe(true);
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
