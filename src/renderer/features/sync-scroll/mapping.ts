export interface SyncAnchor {
  readonly sourceLine: number;
  readonly blockTop: number;
  readonly blockHeight: number;
}

export interface PageGeometry {
  readonly anchors: readonly SyncAnchor[];
  readonly height: number;
  readonly page: HTMLElement;
  readonly sourceLine: number;
  readonly top: number;
}

function clampTop(top: number, maxTop: number): number {
  if (Number.isNaN(top)) {
    return 0;
  }
  return Math.min(maxTop, Math.max(0, top));
}

function lineAnchorIndex(
  anchors: readonly SyncAnchor[],
  sourceLine: number,
): number {
  let low = 0;
  let high = anchors.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const anchor = anchors[middle];
    if (anchor === undefined || anchor.sourceLine > sourceLine) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return Math.max(0, high);
}

function topAnchorIndex(anchors: readonly SyncAnchor[], top: number): number {
  let low = 0;
  let high = anchors.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const anchor = anchors[middle];
    if (anchor === undefined || anchor.blockTop > top) {
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return Math.max(0, high);
}

export function previewTopForLine(
  anchors: readonly SyncAnchor[],
  sourceLine: number,
  maxTop: number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (sourceLine <= first.sourceLine || Number.isNaN(sourceLine)) {
    return clampTop(first.blockTop, maxTop);
  }
  if (sourceLine >= last.sourceLine) {
    return clampTop(last.blockTop, maxTop);
  }

  const anchorIndex = lineAnchorIndex(anchors, sourceLine);
  const anchor = anchors[anchorIndex];
  const next = anchors[anchorIndex + 1];
  if (anchor === undefined || next === undefined) {
    return 0;
  }
  const progress =
    (sourceLine - anchor.sourceLine) / (next.sourceLine - anchor.sourceLine);
  return clampTop(
    anchor.blockTop + progress * (next.blockTop - anchor.blockTop),
    maxTop,
  );
}

export function sourceLineForPreviewTop(
  anchors: readonly SyncAnchor[],
  top: number,
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) {
    return 1;
  }
  if (top <= first.blockTop || Number.isNaN(top)) {
    return first.sourceLine;
  }
  if (top >= last.blockTop) {
    return last.sourceLine;
  }

  const anchorIndex = topAnchorIndex(anchors, top);
  const anchor = anchors[anchorIndex];
  const next = anchors[anchorIndex + 1];
  if (anchor === undefined || next === undefined) {
    return first.sourceLine;
  }
  const progress = (top - anchor.blockTop) / (next.blockTop - anchor.blockTop);
  return Math.round(
    anchor.sourceLine + progress * (next.sourceLine - anchor.sourceLine),
  );
}
