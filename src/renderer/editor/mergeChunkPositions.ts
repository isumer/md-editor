import type { ChangeDesc } from "@codemirror/state";

import type { MergeChunk } from "../../shared/merge/mergeChunks";

export interface ChunkPosition {
  readonly end: number;
  readonly start: number;
}

interface PositionNode {
  readonly end: number;
  readonly from: number;
  readonly lazy: number;
  readonly left: PositionNode | null;
  readonly maxHigh: number;
  readonly maxStart: number;
  readonly minLow: number;
  readonly right: PositionNode | null;
  readonly start: number;
  readonly to: number;
}

function leaf(index: number, chunk: MergeChunk): PositionNode {
  return {
    end: chunk.end,
    from: index,
    lazy: 0,
    left: null,
    maxHigh: Math.max(chunk.start, chunk.end),
    maxStart: chunk.start,
    minLow: Math.min(chunk.start, chunk.end),
    right: null,
    start: chunk.start,
    to: index + 1,
  };
}

function branch(left: PositionNode, right: PositionNode): PositionNode {
  return {
    end: 0,
    from: left.from,
    lazy: 0,
    left,
    maxHigh: Math.max(left.maxHigh, right.maxHigh),
    maxStart: Math.max(left.maxStart, right.maxStart),
    minLow: Math.min(left.minLow, right.minLow),
    right,
    start: 0,
    to: right.to,
  };
}

function build(chunks: readonly MergeChunk[], from: number, to: number): PositionNode {
  if (to - from === 1) {
    const chunk = chunks[from];
    if (chunk === undefined) throw new RangeError("A chunk position is missing");
    return leaf(from, chunk);
  }
  const middle = from + Math.floor((to - from) / 2);
  return branch(build(chunks, from, middle), build(chunks, middle, to));
}

function shifted(node: PositionNode, delta: number): PositionNode {
  if (delta === 0) return node;
  return {
    ...node,
    end: node.end + delta,
    lazy: node.lazy + delta,
    maxHigh: node.maxHigh + delta,
    maxStart: node.maxStart + delta,
    minLow: node.minLow + delta,
    start: node.start + delta,
  };
}

function children(node: PositionNode): readonly [PositionNode, PositionNode] {
  if (node.left === null || node.right === null) {
    throw new RangeError("A position leaf has no children");
  }
  return [shifted(node.left, node.lazy), shifted(node.right, node.lazy)];
}

function addFrom(node: PositionNode, from: number, delta: number): PositionNode {
  if (delta === 0 || node.to <= from) return node;
  if (node.from >= from) return shifted(node, delta);
  const [left, right] = children(node);
  return branch(addFrom(left, from, delta), addFrom(right, from, delta));
}

function setPosition(
  node: PositionNode,
  index: number,
  position: ChunkPosition,
): PositionNode {
  if (node.to - node.from === 1) {
    return leaf(index, { kind: "change", left: "", right: "", ...position });
  }
  const [left, right] = children(node);
  return index < left.to
    ? branch(setPosition(left, index, position), right)
    : branch(left, setPosition(right, index, position));
}

function positionAt(node: PositionNode, index: number): ChunkPosition | null {
  if (index < node.from || index >= node.to) return null;
  return knownPositionAt(node, index);
}

function knownPositionAt(node: PositionNode, index: number): ChunkPosition {
  if (node.to - node.from === 1) return { start: node.start, end: node.end };
  const [left, right] = children(node);
  return knownPositionAt(index < left.to ? left : right, index);
}

function firstStartAtOrAfter(node: PositionNode, position: number): number {
  if (node.maxStart < position) return node.to;
  if (node.to - node.from === 1) return node.from;
  const [left, right] = children(node);
  const inLeft = firstStartAtOrAfter(left, position);
  return inLeft < left.to ? inLeft : firstStartAtOrAfter(right, position);
}

function touches(position: ChunkPosition, from: number, to: number): boolean {
  const low = Math.min(position.start, position.end);
  const high = Math.max(position.start, position.end);
  if (from === to) {
    return (low === high && low === from) || (low < from && high > from);
  }
  return low < to && high > from;
}

function collectTouched(
  node: PositionNode,
  from: number,
  to: number,
  result: Set<number>,
): void {
  if (node.maxHigh < from || node.minLow > to) return;
  if (node.to - node.from === 1) {
    if (touches({ start: node.start, end: node.end }, from, to)) result.add(node.from);
    return;
  }
  const [left, right] = children(node);
  collectTouched(left, from, to, result);
  collectTouched(right, from, to, result);
}

export interface MappedChunkPositions {
  readonly changed: readonly number[];
  readonly positions: ChunkPositions;
}

export class ChunkPositions {
  private constructor(
    private readonly root: PositionNode | null,
    readonly length: number,
  ) {}

  static create(chunks: readonly MergeChunk[]): ChunkPositions {
    const root = chunks.length === 0 ? null : build(chunks, 0, chunks.length);
    return new ChunkPositions(root, chunks.length);
  }

  get(index: number): ChunkPosition | null {
    return this.root === null ? null : positionAt(this.root, index);
  }

  getKnown(index: number): ChunkPosition {
    if (this.root === null) throw new RangeError("An empty position index has no chunks");
    return knownPositionAt(this.root, index);
  }

  map(changes: ChangeDesc): MappedChunkPositions {
    if (this.root === null || changes.empty) return { changed: [], positions: this };
    const touched = new Set<number>();
    const shifts: { readonly from: number; readonly delta: number }[] = [];
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      collectTouched(this.root as PositionNode, fromA, toA, touched);
      shifts.push({
        from: firstStartAtOrAfter(this.root as PositionNode, toA),
        delta: (toB - fromB) - (toA - fromA),
      });
    }, true);
    let root = this.root;
    for (const shift of shifts) root = addFrom(root, shift.from, shift.delta);
    for (const index of touched) {
      const current = knownPositionAt(this.root, index);
      root = setPosition(root, index, {
        start: changes.mapPos(current.start, 1),
        end: changes.mapPos(current.end, -1),
      });
    }
    return {
      changed: [...touched].sort((left, right) => left - right),
      positions: new ChunkPositions(root, this.length),
    };
  }
}
