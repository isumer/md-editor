import { describe, expect, it } from "vitest";

import { FrameCoalescer } from "../../src/renderer/core/frameCoalescer";

function harness() {
  const frames: Array<() => void> = [];
  const applied: string[] = [];
  const coalescer = new FrameCoalescer<{ id: string }>({
    requestFrame: (callback) => {
      frames.push(callback);
    },
    apply: (item) => {
      applied.push(item.id);
    },
  });
  const runFrame = (): void => {
    const callback = frames.shift();
    callback?.();
  };
  return { applied, coalescer, frames, runFrame };
}

describe("frame coalescer", () => {
  it("AC-R4-03: three updates in one frame evaluate dirty and render once", () => {
    const { applied, coalescer, frames, runFrame } = harness();

    coalescer.changed({ id: "a" });
    coalescer.changed({ id: "a" });
    coalescer.changed({ id: "a" });
    expect(frames).toHaveLength(1);
    expect(applied).toEqual([]);

    runFrame();
    expect(applied).toEqual(["a"]);
  });

  it("AC-R4-03: keeps one pending update per document", () => {
    const { applied, coalescer, runFrame } = harness();

    coalescer.changed({ id: "a" });
    coalescer.changed({ id: "b" });
    coalescer.changed({ id: "a" });
    runFrame();

    expect(applied).toEqual(["a", "b"]);
  });

  it("AC-R4-03: forgets a closed document before the frame runs", () => {
    const { applied, coalescer, runFrame } = harness();

    coalescer.changed({ id: "a" });
    coalescer.forget("a");
    runFrame();

    expect(applied).toEqual([]);
  });
});
