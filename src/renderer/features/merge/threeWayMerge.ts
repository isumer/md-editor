import { diffLines, type DiffHunk } from "../../../shared/diff/lineDiff";
import {
  createMergeState,
  type MergeChunk,
} from "../../../shared/merge/mergeChunks";
import type { MarkerMergeState } from "../../editor/editor";

interface SideChange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface ThreeWayMergeResult {
  readonly base: string;
  readonly chunks: readonly MergeChunk[];
  readonly conflictCount: number;
  readonly left: string;
  readonly right: string;
}

function splitLines(text: string): readonly string[] {
  if (text.length === 0) return [];
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    if (newline < 0) {
      lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, newline + 1));
    start = newline + 1;
  }
  return lines;
}

function appendChange(
  changes: SideChange[],
  hunk: Extract<DiffHunk, { kind: "change" }>,
  baseStart: number,
): number {
  let baseEnd = baseStart;
  let text = "";
  for (const line of hunk.lines) {
    if (line.kind !== "added") baseEnd += 1;
    if (line.kind !== "deleted") text += line.right;
  }
  changes.push({ start: baseStart, end: baseEnd, text });
  return baseEnd;
}

function sideChanges(
  base: readonly string[],
  side: readonly string[],
): readonly SideChange[] {
  const changes: SideChange[] = [];
  let baseIndex = 0;
  for (const hunk of diffLines(base, side, {}).hunks) {
    if (hunk.kind === "unchanged") {
      baseIndex = hunk.leftStart - 1 + hunk.lineCount;
    } else {
      baseIndex = appendChange(changes, hunk, baseIndex);
    }
  }
  return changes;
}

function isBefore(left: SideChange, right: SideChange): boolean {
  if (left.end < right.start) return true;
  if (left.end !== right.start) return false;
  return left.start !== left.end;
}

function overlaps(left: SideChange, right: SideChange): boolean {
  return !isBefore(left, right) && !isBefore(right, left);
}

function lineOffsets(lines: readonly string[]): readonly number[] {
  const offsets = [0];
  let offset = 0;
  for (const line of lines) {
    offset += line.length;
    offsets.push(offset);
  }
  return offsets;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new RangeError("Merge change is outside the base text");
  return value;
}

function chunk(
  kind: MergeChunk["kind"],
  change: SideChange,
  offsets: readonly number[],
  left = change.text,
  right = change.text,
): MergeChunk {
  return {
    kind,
    start: required(offsets[change.start]),
    end: required(offsets[change.end]),
    left,
    right,
  };
}

function clusterTouches(change: SideChange, start: number, end: number): boolean {
  if (start === end) return change.start === start;
  if (change.start === change.end) {
    return change.start >= start && change.start < end;
  }
  return change.start < end && start < change.end;
}

function collectCluster(
  changes: readonly SideChange[],
  index: number,
  start: number,
  end: number,
): { readonly changes: readonly SideChange[]; readonly index: number; readonly end: number } {
  const result: SideChange[] = [];
  let next = index;
  let clusterEnd = end;
  while (changes[next] !== undefined &&
    clusterTouches(changes[next] as SideChange, start, clusterEnd)) {
    const change = changes[next] as SideChange;
    result.push(change);
    clusterEnd = Math.max(clusterEnd, change.end);
    next += 1;
  }
  return { changes: result, index: next, end: clusterEnd };
}

function collectOverlappingClusters(
  sides: readonly [readonly SideChange[], readonly SideChange[]],
  indexes: readonly [number, number],
  range: { readonly start: number; readonly end: number },
): readonly [ReturnType<typeof collectCluster>, ReturnType<typeof collectCluster>] {
  let clusterEnd = range.end;
  while (true) {
    const leftCluster = collectCluster(sides[0], indexes[0], range.start, clusterEnd);
    const rightCluster = collectCluster(
      sides[1],
      indexes[1],
      range.start,
      Math.max(clusterEnd, leftCluster.end),
    );
    const nextEnd = Math.max(leftCluster.end, rightCluster.end);
    if (nextEnd === clusterEnd) return [leftCluster, rightCluster];
    clusterEnd = nextEnd;
  }
}

function segmentText(
  base: readonly string[],
  start: number,
  end: number,
  changes: readonly SideChange[],
): string {
  let cursor = start;
  let result = "";
  for (const change of changes) {
    result += base.slice(cursor, change.start).join("") + change.text;
    cursor = change.end;
  }
  return result + base.slice(cursor, end).join("");
}

function conflictingChunk(
  base: readonly string[],
  offsets: readonly number[],
  left: readonly SideChange[],
  right: readonly SideChange[],
): MergeChunk {
  const start = Math.min(required(left[0]).start, required(right[0]).start);
  const end = Math.max(
    required(left[left.length - 1]).end,
    required(right[right.length - 1]).end,
  );
  const leftText = segmentText(base, start, end, left);
  const rightText = segmentText(base, start, end, right);
  return chunk(
    leftText === rightText ? "change" : "conflict",
    { start, end, text: leftText },
    offsets,
    leftText,
    rightText,
  );
}

function mergeChanges(
  base: readonly string[],
  left: readonly SideChange[],
  right: readonly SideChange[],
): readonly MergeChunk[] {
  const offsets = lineOffsets(base);
  const chunks: MergeChunk[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const leftChange = left[leftIndex];
    const rightChange = right[rightIndex];
    if (leftChange !== undefined &&
      (rightChange === undefined || isBefore(leftChange, rightChange))) {
      chunks.push(chunk("change", leftChange, offsets));
      leftIndex += 1;
      continue;
    }
    if (rightChange !== undefined &&
      (leftChange === undefined || isBefore(rightChange, leftChange))) {
      chunks.push(chunk("change", rightChange, offsets));
      rightIndex += 1;
      continue;
    }
    if (leftChange === undefined || rightChange === undefined ||
      !overlaps(leftChange, rightChange)) break;
    const start = Math.min(leftChange.start, rightChange.start);
    const end = Math.max(leftChange.end, rightChange.end);
    const [leftCluster, rightCluster] = collectOverlappingClusters(
      [left, right], [leftIndex, rightIndex], { start, end },
    );
    chunks.push(conflictingChunk(base, offsets, leftCluster.changes, rightCluster.changes));
    leftIndex = leftCluster.index;
    rightIndex = rightCluster.index;
  }
  return chunks;
}

export function createThreeWayMerge(
  baseText: string,
  leftText: string,
  rightText: string,
): ThreeWayMergeResult {
  const base = splitLines(baseText);
  const chunks = mergeChanges(
    base,
    sideChanges(base, splitLines(leftText)),
    sideChanges(base, splitLines(rightText)),
  );
  return {
    base: baseText,
    chunks,
    conflictCount: chunks.filter((item) => item.kind === "conflict").length,
    left: leftText,
    right: rightText,
  };
}

export function createThreeWayMergeState(
  base: string,
  left: string,
  right: string,
): MarkerMergeState {
  const result = createThreeWayMerge(base, left, right);
  return {
    expected: result.chunks.map((item) => base.slice(item.start, item.end)),
    left,
    merge: createMergeState(result.chunks),
    right,
  };
}
