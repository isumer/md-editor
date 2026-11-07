export interface SyncAnchor {
  readonly sourceLine: number;
  readonly blockTop: number;
  readonly blockHeight: number;
}

export function previewTopForLine(
  anchors: readonly SyncAnchor[],
  sourceLine: number,
  maxTop: number,
): number {
  const first = anchors[0];
  if (first === undefined) return 0;
  const last = anchors[anchors.length - 1] ?? first;
  if (sourceLine <= first.sourceLine) return Math.min(first.blockTop, maxTop);
  if (sourceLine >= last.sourceLine) return Math.min(last.blockTop, maxTop);

  let low = 0;
  let high = anchors.length - 1;
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    const anchor = anchors[middle] ?? first;
    if (anchor.sourceLine <= sourceLine) low = middle;
    else high = middle;
  }

  const before = anchors[low] ?? first;
  const after = anchors[high] ?? last;
  if (sourceLine === before.sourceLine) {
    return Math.min(before.blockTop, maxTop);
  }
  const lineProgress =
    (sourceLine - before.sourceLine) /
    (after.sourceLine - before.sourceLine);
  const previewTop =
    before.blockTop + lineProgress * (after.blockTop - before.blockTop);
  return Math.min(maxTop, Math.max(0, previewTop));
}

export function sourceLineForPreviewTop(
  anchors: readonly SyncAnchor[],
  top: number,
): number {
  const first = anchors[0];
  if (first === undefined) return 1;
  const last = anchors[anchors.length - 1] ?? first;
  if (top <= first.blockTop) return first.sourceLine;
  if (top >= last.blockTop) return last.sourceLine;

  let low = 0;
  let high = anchors.length - 1;
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    const anchor = anchors[middle] ?? first;
    if (anchor.blockTop <= top) low = middle;
    else high = middle;
  }

  const before = anchors[low] ?? first;
  const after = anchors[high] ?? last;
  if (top === before.blockTop) return before.sourceLine;
  const topProgress =
    (top - before.blockTop) / (after.blockTop - before.blockTop);
  return Math.round(
    before.sourceLine + topProgress * (after.sourceLine - before.sourceLine),
  );
}
