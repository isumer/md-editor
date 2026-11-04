import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RenderScheduler,
  type ScheduledRender,
} from "../../src/renderer/renderScheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("RenderScheduler", () => {
  it("AC-R1-02: renders a single change after 150 ms", async () => {
    vi.useFakeTimers();
    let now = 0;
    const requests: ScheduledRender[] = [];
    const scheduler = new RenderScheduler((request) => requests.push(request), () => now);

    scheduler.schedule("hello");
    await vi.advanceTimersByTimeAsync(149);
    expect(requests).toEqual([]);

    now = 150;
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toEqual([{ id: 1, text: "hello" }]);
  });

  it("AC-R1-02: renders continuous changes by 500 ms", async () => {
    vi.useFakeTimers();
    let now = 0;
    const requests: ScheduledRender[] = [];
    const scheduler = new RenderScheduler((request) => requests.push(request), () => now);

    scheduler.schedule("0");
    for (let time = 100; time <= 400; time += 100) {
      await vi.advanceTimersByTimeAsync(100);
      now = time;
      scheduler.schedule(String(time));
    }
    expect(requests).toEqual([]);

    await vi.advanceTimersByTimeAsync(99);
    expect(requests).toEqual([]);
    now = 500;
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toEqual([{ id: 1, text: "400" }]);
  });

  it("AC-R1-05: does not apply a result older than the newest applied result", () => {
    const scheduler = new RenderScheduler(() => undefined, () => 0);
    const applied: string[] = [];

    expect(scheduler.applyResult(2, "new", (value) => applied.push(value))).toBe(true);
    expect(scheduler.applyResult(1, "old", (value) => applied.push(value))).toBe(false);
    expect(applied).toEqual(["new"]);
  });

  it("AC-R1-02: cancels a pending render when disposed", async () => {
    vi.useFakeTimers();
    const requests: ScheduledRender[] = [];
    const scheduler = new RenderScheduler((request) => requests.push(request), () => 0);

    scheduler.schedule("discarded");
    scheduler.dispose();
    scheduler.dispose();
    await vi.runAllTimersAsync();

    expect(requests).toEqual([]);
  });
});
