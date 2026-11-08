import { describe, expect, it, vi } from "vitest";

import { DraftScheduler, type TimerHandle } from "../../src/renderer/core/draftScheduler";

interface Timer {
  callback: () => void;
  milliseconds: number;
}

function scheduler() {
  const timers = new Map<TimerHandle, Timer>();
  let nextHandle = 1;
  const onDraft = vi.fn();
  const draftScheduler = new DraftScheduler({
    onDraft,
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
  return { draftScheduler, timers, onDraft };
}

function fire(timers: Map<TimerHandle, Timer>): void {
  const [handle, timer] = [...timers.entries()][0] ?? [];
  if (handle !== undefined && timer) {
    timers.delete(handle);
    timer.callback();
  }
}

describe("draft scheduler", () => {
  it("AC-R4-07: drafts an idle document after two seconds", () => {
    const { draftScheduler, timers, onDraft } = scheduler();

    draftScheduler.documentChanged("doc", 100);
    draftScheduler.documentChanged("doc", 120);

    expect(timers.size).toBe(1);
    expect([...timers.values()][0]?.milliseconds).toBe(2_000);
    expect(onDraft).not.toHaveBeenCalled();
    fire(timers);
    expect(onDraft).toHaveBeenCalledWith("doc");
    expect(draftScheduler.hasPending("doc")).toBe(false);
  });

  it("AC-R4-07: keeps two seconds at five megabytes", () => {
    const { draftScheduler, timers } = scheduler();

    draftScheduler.documentChanged("large", 5 * 1024 * 1024);

    expect([...timers.values()][0]?.milliseconds).toBe(2_000);
  });

  it("AC-R4-07: waits ten seconds above five megabytes", () => {
    const { draftScheduler, timers } = scheduler();

    draftScheduler.documentChanged("large", 5 * 1024 * 1024 + 1);

    expect([...timers.values()][0]?.milliseconds).toBe(10_000);
  });

  it("AC-R4-07: saving or closing cancels the pending draft", () => {
    const { draftScheduler, timers } = scheduler();

    draftScheduler.documentChanged("doc", 10);
    draftScheduler.documentSaved("doc");

    expect(timers.size).toBe(0);
    expect(draftScheduler.hasPending("doc")).toBe(false);
  });

  it("AC-R4-07: dispose cancels every document timer", () => {
    const { draftScheduler, timers } = scheduler();

    draftScheduler.documentChanged("one", 10);
    draftScheduler.documentChanged("two", 10);
    draftScheduler.dispose();

    expect(timers.size).toBe(0);
  });

  it("AC-R4-07: uses the system timers when none are injected", () => {
    const draftScheduler = new DraftScheduler({ onDraft: vi.fn() });

    draftScheduler.documentChanged("doc", 10);
    expect(draftScheduler.hasPending("doc")).toBe(true);
    draftScheduler.documentSaved("doc");

    expect(draftScheduler.hasPending("doc")).toBe(false);
  });
});
