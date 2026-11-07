import { describe, expect, it } from "vitest";

import {
  previewTopForLine,
  sourceLineForPreviewTop,
  type SyncAnchor,
} from "../../src/renderer/features/sync-scroll/mapping";

const fiveAnchors: readonly SyncAnchor[] = [
  { sourceLine: 1, blockTop: 0, blockHeight: 40 },
  { sourceLine: 5, blockTop: 80, blockHeight: 60 },
  { sourceLine: 10, blockTop: 200, blockHeight: 80 },
  { sourceLine: 20, blockTop: 500, blockHeight: 100 },
  { sourceLine: 40, blockTop: 900, blockHeight: 120 },
];

function seededValues(count: number, limit: number): number[] {
  let state = 0x9e37_79b9;
  return Array.from({ length: count }, () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state % limit;
  }).sort((left, right) => left - right);
}

describe("sync scroll mapping", () => {
  it("AC-R3-01: returns the block top at every anchor line", () => {
    for (const anchor of fiveAnchors) {
      expect(previewTopForLine(fiveAnchors, anchor.sourceLine, 2_000)).toBe(
        anchor.blockTop,
      );
    }
  });

  it("AC-R3-01: interpolates between two anchors", () => {
    const anchors: readonly SyncAnchor[] = [
      { sourceLine: 10, blockTop: 100, blockHeight: 100 },
      { sourceLine: 20, blockTop: 300, blockHeight: 100 },
    ];

    expect(previewTopForLine(anchors, 15, 1_000)).toBe(200);
  });

  it("AC-R3-01: clamps before the first anchor and after the last", () => {
    expect(previewTopForLine(fiveAnchors, -10, 2_000)).toBe(0);
    expect(previewTopForLine(fiveAnchors, 100, 2_000)).toBe(900);
  });

  it("AC-R3-01: clamps to the top bound", () => {
    expect(previewTopForLine(fiveAnchors, 20, 300)).toBe(300);
  });

  it("AC-R3-01: interpolates inside one tall block", () => {
    const anchors: readonly SyncAnchor[] = [
      { sourceLine: 1, blockTop: 0, blockHeight: 1_000 },
      { sourceLine: 100, blockTop: 1_000, blockHeight: 100 },
    ];

    expect(previewTopForLine(anchors, 50, 2_000)).toBeCloseTo(
      (49 / 99) * 1_000,
    );
  });

  it("AC-R3-01: returns 0 for an empty list", () => {
    expect(previewTopForLine([], 20, 300)).toBe(0);
  });

  it("AC-R3-02: returns the line at every anchor top", () => {
    for (const anchor of fiveAnchors) {
      expect(sourceLineForPreviewTop(fiveAnchors, anchor.blockTop)).toBe(
        anchor.sourceLine,
      );
    }
  });

  it("AC-R3-02: interpolates between two anchors and rounds", () => {
    const anchors: readonly SyncAnchor[] = [
      { sourceLine: 10, blockTop: 100, blockHeight: 100 },
      { sourceLine: 20, blockTop: 300, blockHeight: 100 },
    ];

    expect(sourceLineForPreviewTop(anchors, 250)).toBe(18);
  });

  it("AC-R3-02: clamps at both ends", () => {
    expect(sourceLineForPreviewTop(fiveAnchors, -100)).toBe(1);
    expect(sourceLineForPreviewTop(fiveAnchors, 2_000)).toBe(40);
  });

  it("AC-R3-02: returns 1 for an empty list", () => {
    expect(sourceLineForPreviewTop([], 100)).toBe(1);
  });

  it("AC-R3-02: uses one anchor for every top", () => {
    const anchors: readonly SyncAnchor[] = [
      { sourceLine: 17, blockTop: 200, blockHeight: 80 },
    ];

    expect(sourceLineForPreviewTop(anchors, -100)).toBe(17);
    expect(sourceLineForPreviewTop(anchors, 200)).toBe(17);
    expect(sourceLineForPreviewTop(anchors, 10_000)).toBe(17);
  });

  it("AC-R3-01: never decreases as the line grows", () => {
    const tops = seededValues(1_000, 60).map((line) =>
      previewTopForLine(fiveAnchors, line, 2_000),
    );

    for (let index = 1; index < tops.length; index += 1) {
      expect(tops[index]).toBeGreaterThanOrEqual(tops[index - 1] ?? 0);
    }
  });

  it("AC-R3-02: never decreases as the top grows", () => {
    const lines = seededValues(1_000, 1_100).map((top) =>
      sourceLineForPreviewTop(fiveAnchors, top),
    );

    for (let index = 1; index < lines.length; index += 1) {
      expect(lines[index]).toBeGreaterThanOrEqual(lines[index - 1] ?? 1);
    }
  });

  it("AC-R3-01: does not change the input", () => {
    const anchors = Object.freeze(
      fiveAnchors.map((anchor) => Object.freeze({ ...anchor })),
    );
    const before = anchors.map((anchor) => ({ ...anchor }));

    previewTopForLine(anchors, 15, 2_000);
    sourceLineForPreviewTop(anchors, 400);

    expect(anchors).toEqual(before);
  });

  it("AC-R3-01: finds an anchor in a long list quickly", () => {
    const anchors: readonly SyncAnchor[] = Array.from(
      { length: 20_000 },
      (_, index) => ({
        sourceLine: index * 2 + 1,
        blockTop: index * 3,
        blockHeight: 3,
      }),
    );
    let result = 0;

    const start = performance.now();
    for (let call = 0; call < 100_000; call += 1) {
      result += previewTopForLine(anchors, 30_001, 100_000);
    }
    const duration = performance.now() - start;

    expect(result).toBe(4_500_000_000);
    expect(duration).toBeLessThan(2_000);
  });
});
