import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTRIBUTION_INTERVAL_MS,
  createContributionPump,
} from "../../src/main/app/menuContribution";
import type { MenuContribution } from "../../src/shared/ipc/menu";

function contribution(title = "Open"): MenuContribution {
  return {
    fileMenuTitle: "File",
    viewMenuTitle: "View",
    items: [{ id: "file-open", title, accelerator: "CmdOrCtrl+O" }],
  };
}

interface FakeTimer {
  readonly callback: () => void;
  readonly delay: number;
  readonly due: number;
}

function manualClock() {
  let current = 0;
  let scheduled: FakeTimer | null = null;
  let clears = 0;
  return {
    now: () => current,
    setTimer: (callback: () => void, delay: number): ReturnType<typeof setTimeout> => {
      scheduled = { callback, delay, due: current + delay };
      return scheduled as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (): void => {
      clears += 1;
      scheduled = null;
    },
    advance(milliseconds: number): void {
      current += milliseconds;
      if (scheduled !== null && current >= scheduled.due) {
        const timer = scheduled;
        scheduled = null;
        timer.callback();
      }
    },
    pending: () => scheduled,
    clears: () => clears,
    current: () => current,
  };
}

describe("contribution pump", () => {
  it("AC-R5-21: applies the first contribution immediately", () => {
    const clock = manualClock();
    const apply = vi.fn();
    const pump = createContributionPump({
      apply,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    pump.push(contribution("first"));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(contribution("first"));
    expect(clock.pending()).toBeNull();
  });

  it("AC-R5-21: collapses a burst into one trailing application with the latest state", () => {
    const clock = manualClock();
    const applied: string[] = [];
    const pump = createContributionPump({
      apply: (value) => applied.push(value.items[0]?.title ?? "none"),
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    pump.push(contribution("leading"));
    pump.push(contribution("second"));
    clock.advance(40);
    pump.push(contribution("third"));
    expect(clock.pending()?.delay).toBe(100);
    expect(applied).toEqual(["leading"]);

    clock.advance(59);
    expect(applied).toEqual(["leading"]);
    clock.advance(1);

    expect(applied).toEqual(["leading", "third"]);
    expect(clock.pending()).toBeNull();
  });

  it("AC-R5-21: applies at most one contribution per interval under a steady stream", () => {
    const clock = manualClock();
    const appliedAt: number[] = [];
    const pump = createContributionPump({
      apply: () => appliedAt.push(clock.current()),
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    for (let step = 0; step < 10; step += 1) {
      pump.push(contribution(`step-${step}`));
      clock.advance(10);
    }

    expect(appliedAt[0]).toBe(0);
    for (let index = 1; index < appliedAt.length; index += 1) {
      expect((appliedAt[index] ?? 0) - (appliedAt[index - 1] ?? 0)).toBeGreaterThanOrEqual(100);
    }
    expect(appliedAt.length).toBeLessThanOrEqual(2);
  });

  it("AC-R5-21: applies a contribution spaced a full interval apart immediately", () => {
    const clock = manualClock();
    const appliedAt: number[] = [];
    const pump = createContributionPump({
      apply: () => appliedAt.push(clock.current()),
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    pump.push(contribution("a"));
    clock.advance(CONTRIBUTION_INTERVAL_MS);
    pump.push(contribution("b"));
    clock.advance(250);
    pump.push(contribution("c"));

    expect(appliedAt).toEqual([0, 100, 350]);
    expect(clock.pending()).toBeNull();
  });

  it("AC-R5-21: flush applies a pending contribution, cancels its timer, and is idempotent", () => {
    const clock = manualClock();
    const apply = vi.fn();
    const pump = createContributionPump({
      apply,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    pump.push(contribution("leading"));
    pump.push(contribution("pending"));
    expect(clock.pending()).not.toBeNull();

    pump.flush();
    expect(clock.clears()).toBe(1);
    expect(clock.pending()).toBeNull();
    expect(apply).toHaveBeenLastCalledWith(contribution("pending"));
    expect(apply).toHaveBeenCalledTimes(2);

    pump.flush();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("AC-R5-21: uses the platform timer defaults and the 100 ms interval", () => {
    vi.useFakeTimers();
    try {
      const applied: string[] = [];
      const pump = createContributionPump({
        apply: (value) => applied.push(value.items[0]?.title ?? "none"),
      });

      pump.push(contribution("leading"));
      pump.push(contribution("pending"));
      expect(CONTRIBUTION_INTERVAL_MS).toBe(100);
      expect(applied).toEqual(["leading"]);

      vi.advanceTimersByTime(99);
      expect(applied).toEqual(["leading"]);
      vi.advanceTimersByTime(1);
      expect(applied).toEqual(["leading", "pending"]);

      pump.push(contribution("trailing"));
      pump.flush();
      expect(applied).toEqual(["leading", "pending", "trailing"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-R5-21: honours a custom interval", () => {
    const clock = manualClock();
    const apply = vi.fn();
    const pump = createContributionPump({
      apply,
      intervalMs: 20,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    pump.push(contribution("leading"));
    pump.push(contribution("pending"));
    expect(clock.pending()?.delay).toBe(20);
    clock.advance(20);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
