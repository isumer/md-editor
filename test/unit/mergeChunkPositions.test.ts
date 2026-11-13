import { ChangeSet } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { ChunkPositions } from "../../src/renderer/editor/mergeChunkPositions";
import type { MergeChunk } from "../../src/shared/merge/mergeChunks";

function chunk(start: number, end: number): MergeChunk {
  return { kind: "conflict", start, end, left: "left", right: "right" };
}

describe("merge chunk positions", () => {
  it("an empty index stays empty when changes map through it", () => {
    const positions = ChunkPositions.create([]);

    const mapped = positions.map(ChangeSet.empty(0));

    expect(mapped.changed).toEqual([]);
    expect(mapped.positions).toBe(positions);
    expect(positions.get(0)).toBeNull();
    expect(() => positions.getKnown(0)).toThrow("An empty position index has no chunks");
  });

  it("an empty change keeps a populated index unchanged", () => {
    const positions = ChunkPositions.create([chunk(0, 2)]);

    const mapped = positions.map(ChangeSet.empty(2));

    expect(mapped.changed).toEqual([]);
    expect(mapped.positions).toBe(positions);
    expect(positions.get(-1)).toBeNull();
    expect(positions.get(1)).toBeNull();
  });

  it("a replacement maps one touched range and shifts later ranges", () => {
    const positions = ChunkPositions.create([
      chunk(0, 2),
      chunk(4, 6),
      chunk(8, 8),
    ]);
    const changes = ChangeSet.of([
      { from: 1, to: 2, insert: "xxx" },
      { from: 8, insert: "z" },
    ], 8);

    const mapped = positions.map(changes);

    expect(mapped.changed).toEqual([0, 2]);
    expect(mapped.positions.get(0)).toEqual({ start: 0, end: 4 });
    expect(mapped.positions.get(1)).toEqual({ start: 6, end: 8 });
    expect(mapped.positions.get(2)).toEqual({ start: 11, end: 10 });
  });

  it("an insertion between chunks shifts only the later chunk", () => {
    const positions = ChunkPositions.create([chunk(0, 2), chunk(2, 4)]);
    const changes = ChangeSet.of({ from: 2, insert: "x" }, 4);

    const mapped = positions.map(changes);

    expect(mapped.changed).toEqual([]);
    expect(mapped.positions.get(0)).toEqual({ start: 0, end: 2 });
    expect(mapped.positions.get(1)).toEqual({ start: 3, end: 5 });
  });
});
