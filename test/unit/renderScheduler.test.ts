import { describe, expect, it, vi } from "vitest";

import {
  RenderScheduler,
  type ScheduledRender,
} from "../../src/renderer/features/preview/renderScheduler";

interface Harness {
  scheduler: RenderScheduler;
  requests: ScheduledRender[];
  latencies: number[];
  setNow(value: number): void;
  runFrame(): void;
  runTimers(): void;
}

function harness(): Harness {
  let now = 0;
  let nextHandle = 1;
  const requests: ScheduledRender[] = [];
  const latencies: number[] = [];
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; dueAt: number }>();
  const scheduler = new RenderScheduler((request) => requests.push(request), {
    now: () => now,
    maximumWaitMilliseconds: 100,
    requestFrame: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => frames.delete(handle),
    setTimer: (callback, milliseconds) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { callback, dueAt: now + milliseconds });
      return handle;
    },
    clearTimer: (handle) => timers.delete(handle),
    onApplied: (latency) => latencies.push(latency),
  });
  return {
    scheduler,
    requests,
    latencies,
    setNow(value) {
      now = value;
    },
    runFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback();
      }
    },
    runTimers() {
      for (const [handle, timer] of [...timers.entries()]) {
        if (timer.dueAt <= now) {
          timers.delete(handle);
          timer.callback();
        }
      }
    },
  };
}

describe("RenderScheduler", () => {
  it("AC-R1-02: dispatches a burst at most once per animation frame", () => {
    const testHarness = harness();

    testHarness.scheduler.schedule();
    testHarness.scheduler.schedule();
    testHarness.scheduler.schedule();
    expect(testHarness.requests).toEqual([]);

    testHarness.runFrame();
    expect(testHarness.requests).toEqual([{ id: 1 }]);

    testHarness.scheduler.schedule();
    testHarness.runFrame();
    expect(testHarness.requests).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("AC-R1-02: dispatches the last edit within the maximum wait when frames stall", () => {
    const testHarness = harness();

    testHarness.scheduler.schedule();
    testHarness.setNow(99);
    testHarness.runTimers();
    expect(testHarness.requests).toEqual([]);

    testHarness.scheduler.schedule();
    testHarness.setNow(100);
    testHarness.runTimers();
    expect(testHarness.requests).toEqual([{ id: 1 }]);
  });

  it("AC-R1-05: does not apply a result older than the newest applied result", () => {
    const testHarness = harness();
    const applied: string[] = [];

    expect(testHarness.scheduler.applyResult(2, "new", (value) => applied.push(value)))
      .toBe(true);
    expect(testHarness.scheduler.applyResult(1, "old", (value) => applied.push(value)))
      .toBe(false);
    expect(applied).toEqual(["new"]);
  });

  it("AC-R1-02: measures each coalesced burst from its first change to its result", () => {
    const testHarness = harness();

    testHarness.scheduler.schedule();
    testHarness.setNow(16);
    testHarness.scheduler.schedule();
    testHarness.runFrame();
    testHarness.setNow(30);
    testHarness.scheduler.applyResult(1, "result", () => undefined);

    expect(testHarness.latencies).toEqual([30]);
  });

  it("AC-R1-02: uses the window animation frame and timer when no options are given", () => {
    const frames: (() => void)[] = [];
    const requests: ScheduledRender[] = [];
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frames.push(callback);
      return 7;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const scheduler = new RenderScheduler((request) => requests.push(request));

    scheduler.schedule();
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(requests).toEqual([{ id: 1 }]);
    expect(cancelFrame).toHaveBeenCalledWith(7);

    scheduler.dispose();
    vi.unstubAllGlobals();
  });

  it("AC-PERF-02: bounds a stalled default frame at 50 ms", () => {
    const setTimer = vi.fn(() => 2);
    const scheduler = new RenderScheduler(() => undefined, {
      now: () => 0,
      requestFrame: () => 1,
      cancelFrame: () => undefined,
      setTimer,
      clearTimer: () => undefined,
    });

    scheduler.schedule();

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 50);
  });

  it("AC-R1-02: a frame that fires after disposal does nothing", () => {
    const frames: (() => void)[] = [];
    const requests: ScheduledRender[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frames.push(callback);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const scheduler = new RenderScheduler((request) => requests.push(request));

    scheduler.schedule();
    scheduler.dispose();
    frames[0]?.();

    expect(requests).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("AC-R1-02: cancels pending frames and timers when disposed", () => {
    const testHarness = harness();

    testHarness.scheduler.schedule();
    testHarness.scheduler.dispose();
    testHarness.scheduler.dispose();
    testHarness.runFrame();
    testHarness.runTimers();

    expect(testHarness.requests).toEqual([]);
  });
});
