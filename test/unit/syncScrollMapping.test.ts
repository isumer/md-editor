import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  previewTopForLine,
  sourceLineForPreviewTop,
  type SyncAnchor,
} from "../../src/renderer/features/sync-scroll/mapping";

const anchors: readonly SyncAnchor[] = [
  { sourceLine: 2, blockTop: 10, blockHeight: 20 },
  { sourceLine: 10, blockTop: 100, blockHeight: 40 },
  { sourceLine: 20, blockTop: 300, blockHeight: 60 },
  { sourceLine: 35, blockTop: 450, blockHeight: 80 },
  { sourceLine: 50, blockTop: 800, blockHeight: 100 },
];

function seededValues(count: number, modulus: number): number[] {
  const values: number[] = [];
  let state = 0x9e3779b9;
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    values.push(state % modulus);
  }
  return values.sort((left, right) => left - right);
}

describe("sync scroll mapping", () => {
  it("AC-R3-01: returns the block top at every anchor line", () => {
    for (const anchor of anchors) {
      expect(previewTopForLine(anchors, anchor.sourceLine, 1_000)).toBe(
        anchor.blockTop,
      );
    }
  });

  it("AC-R3-01: interpolates between two anchors", () => {
    const pair = anchors.slice(1, 3);

    expect(previewTopForLine(pair, 15, 1_000)).toBe(200);
  });

  it("AC-R3-01: clamps before the first anchor and after the last", () => {
    expect(previewTopForLine(anchors, -20, 1_000)).toBe(10);
    expect(previewTopForLine(anchors, 5_000, 1_000)).toBe(800);
  });

  it("AC-R3-01: clamps to the top bound", () => {
    expect(previewTopForLine(anchors, 50, 500)).toBe(500);
  });

  it("AC-R3-01: interpolates inside one tall block", () => {
    const tallBlock = [
      { sourceLine: 1, blockTop: 0, blockHeight: 1_000 },
      { sourceLine: 100, blockTop: 1_000, blockHeight: 20 },
    ];

    expect(previewTopForLine(tallBlock, 50, 1_000)).toBeCloseTo(
      (49 / 99) * 1_000,
      10,
    );
  });

  it("AC-R3-01: returns 0 for an empty list", () => {
    expect(previewTopForLine([], 10, 1_000)).toBe(0);
  });

  it("AC-R3-02: returns the line at every anchor top", () => {
    for (const anchor of anchors) {
      expect(sourceLineForPreviewTop(anchors, anchor.blockTop)).toBe(
        anchor.sourceLine,
      );
    }
  });

  it("AC-R3-02: interpolates between two anchors and rounds", () => {
    const pair = anchors.slice(1, 3);

    expect(sourceLineForPreviewTop(pair, 250)).toBe(18);
  });

  it("AC-R3-02: clamps at both ends", () => {
    expect(sourceLineForPreviewTop(anchors, -100)).toBe(2);
    expect(sourceLineForPreviewTop(anchors, 10_000)).toBe(50);
  });

  it("AC-R3-02: returns 1 for an empty list", () => {
    expect(sourceLineForPreviewTop([], 100)).toBe(1);
  });

  it("AC-R3-02: uses one anchor for every top", () => {
    const single = [{ sourceLine: 12, blockTop: 40, blockHeight: 80 }];

    expect(sourceLineForPreviewTop(single, -1_000)).toBe(12);
    expect(sourceLineForPreviewTop(single, 1_000)).toBe(12);
  });

  it("AC-R3-01: never decreases as the line grows", () => {
    let previous = 0;
    for (const line of seededValues(1_000, 100)) {
      const current = previewTopForLine(anchors, line, 1_000);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("AC-R3-02: never decreases as the top grows", () => {
    let previous = anchors[0]?.sourceLine ?? 1;
    for (const top of seededValues(1_000, 900)) {
      const current = sourceLineForPreviewTop(anchors, top);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("AC-R3-01: does not change the input", () => {
    const first = Object.freeze({ sourceLine: 1, blockTop: 0, blockHeight: 20 });
    const second = Object.freeze({
      sourceLine: 20,
      blockTop: 300,
      blockHeight: 40,
    });
    const frozen = Object.freeze([first, second]);

    previewTopForLine(frozen, 10, 200);
    sourceLineForPreviewTop(frozen, 100);

    expect(frozen).toEqual([first, second]);
  });

  it("AC-R3-01: finds an anchor in a long list quickly", () => {
    const longList: SyncAnchor[] = Array.from({ length: 20_000 }, (_, index) => ({
      sourceLine: index + 1,
      blockTop: index * 3,
      blockHeight: 3,
    }));
    const startedAt = performance.now();
    let total = 0;

    for (let call = 0; call < 100_000; call += 1) {
      total += previewTopForLine(longList, 19_999, 100_000);
    }
    const duration = performance.now() - startedAt;

    expect(total).toBe(5_999_400_000);
    expect(duration).toBeLessThan(2_000);
  });
});
