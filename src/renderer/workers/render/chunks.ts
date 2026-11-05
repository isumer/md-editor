export interface LineRange {
  startLine: number;
  endLine: number;
}

interface Fence {
  character: string;
  length: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

function openingFence(line: string): Fence | null {
  const match = FENCE_OPEN.exec(line);
  const marker = match?.[1];
  return marker ? { character: marker.charAt(0), length: marker.length } : null;
}

function closesFence(line: string, fence: Fence): boolean {
  const marker = line.trim();
  return marker.length >= fence.length &&
    marker.split("").every((character) => character === fence.character);
}

// Blocks are separated by blank lines, except inside a fenced code block. The
// preview's renderer parses each range on its own, so a range must stand alone.
export function splitChunks(lines: readonly string[]): LineRange[] {
  const ranges: LineRange[] = [];
  let start = -1;
  let fence: Fence | null = null;

  for (const [index, line] of lines.entries()) {
    if (fence) {
      if (closesFence(line, fence)) {
        fence = null;
      }
    } else {
      const opened = openingFence(line);
      if (opened) {
        fence = opened;
      } else if (line.trim() === "") {
        if (start !== -1) {
          ranges.push({ startLine: start, endLine: index });
          start = -1;
        }
        continue;
      }
    }
    if (start === -1) {
      start = index;
    }
  }
  if (start !== -1) {
    ranges.push({ startLine: start, endLine: lines.length });
  }
  return ranges;
}

// The index of the first range that contains or follows the line.
export function rangeIndexAt(ranges: readonly LineRange[], line: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const range = ranges[middle];
    if (!range || range.endLine <= line) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

// Markdown-it numbers data-line from the start of the source it is given, so a
// chunk rendered alone must shift its block lines back into document space.
export function shiftDataLineAttributes(html: string, offset: number): string {
  if (offset === 0) {
    return html;
  }
  return html.replace(/data-line="(\d+)"/g, (_match, line: string) =>
    `data-line="${String(Number(line) + offset)}"`);
}
