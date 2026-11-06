import { describe, expect, it, vi } from "vitest";

import {
  WorkerHeartbeat,
  type TimerHandle,
} from "../../src/renderer/core/heartbeat";

interface Timer {
  callback: () => void;
  milliseconds: number;
}

function heartbeat() {
  const timers = new Map<TimerHandle, Timer>();
  let nextHandle = 1;
  let now = 0;
  const onPing = vi.fn();
  const onStuck = vi.fn();
  const monitor = new WorkerHeartbeat({
    onPing,
    onStuck,
    now: () => now,
    setTimer: (callback, milliseconds) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { callback, milliseconds });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle);
    },
  });
  const advance = (milliseconds: number): void => {
    now += milliseconds;
    const [handle, timer] = [...timers.entries()][0] ?? [];
    if (handle !== undefined && timer) {
      timers.delete(handle);
      timer.callback();
    }
  };
  return { monitor, timers, onPing, onStuck, advance };
}

describe("render worker heartbeat", () => {
  it("AC-R1-12: reports a worker stuck after a bounded wait", () => {
    const { monitor, timers, onPing, onStuck, advance } = heartbeat();

    monitor.start();
    expect(onPing).toHaveBeenCalledWith(1);
    expect([...timers.values()][0]?.milliseconds).toBe(500);

    advance(500);
    advance(500);
    expect(onStuck).not.toHaveBeenCalled();

    advance(500);
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });

  it("AC-R1-12: a pong keeps the worker alive and starts the next ping", () => {
    const { monitor, onPing, onStuck, advance } = heartbeat();

    monitor.start();
    monitor.pong(1);
    advance(500);

    expect(onStuck).not.toHaveBeenCalled();
    expect(onPing).toHaveBeenLastCalledWith(2);
  });

  it("AC-R1-12: ignores a stale pong and stop ends monitoring", () => {
    const { monitor, timers, onStuck, advance } = heartbeat();

    monitor.start();
    monitor.pong(99);
    monitor.stop();

    expect(timers.size).toBe(0);
    advance(2_000);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it("AC-R1-12: start is idempotent", () => {
    const { monitor, onPing } = heartbeat();

    monitor.start();
    monitor.start();

    expect(onPing).toHaveBeenCalledTimes(1);
  });

  it("AC-R1-12: a timer that fires after stop does nothing", () => {
    const callbacks: Array<() => void> = [];
    const onPing = vi.fn();
    const onStuck = vi.fn();
    const monitor = new WorkerHeartbeat({
      onPing,
      onStuck,
      setTimer: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      clearTimer: () => undefined,
    });

    monitor.start();
    monitor.stop();
    callbacks[0]?.();

    expect(onPing).toHaveBeenCalledOnce();
    expect(onStuck).not.toHaveBeenCalled();
  });

  it("AC-R1-12: uses the system timers when none are injected", () => {
    const onPing = vi.fn();
    const monitor = new WorkerHeartbeat({
      onPing,
      onStuck: vi.fn(),
    });

    monitor.start();
    monitor.stop();

    expect(onPing).toHaveBeenCalledOnce();
  });
});
