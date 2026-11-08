export interface LineDiffOptions {
  readonly ignoreTrailingWhitespace?: boolean;
  readonly ignoreCase?: boolean;
  readonly ignoreLineEndings?: boolean;
}

export interface UnchangedHunk {
  readonly kind: "unchanged";
  readonly leftStart: number;
  readonly rightStart: number;
  readonly lineCount: number;
}

export interface DeletedLine {
  readonly kind: "deleted";
  readonly leftLineNumber: number;
  readonly left: string;
}

export interface AddedLine {
  readonly kind: "added";
  readonly rightLineNumber: number;
  readonly right: string;
}

export interface ModifiedLine {
  readonly kind: "modified";
  readonly leftLineNumber: number;
  readonly rightLineNumber: number;
  readonly left: string;
  readonly right: string;
}

export type ChangedLine = DeletedLine | AddedLine | ModifiedLine;

export interface ChangeHunk {
  readonly kind: "change";
  readonly lines: readonly ChangedLine[];
}

export type DiffHunk = UnchangedHunk | ChangeHunk;

type Edit =
  | { readonly kind: "same"; readonly left: number; readonly right: number }
  | { readonly kind: "deleted"; readonly left: number }
  | { readonly kind: "added"; readonly right: number };

const MAX_EDIT_DISTANCE = 512;
const MAX_WORK = 1_000_000;

// Scans back from the end: a regex here is quadratic on a long inner blank run.
function withoutTrailingBlanks(line: string): string {
  const endingLength = line.endsWith("\r\n")
    ? 2
    : line.endsWith("\r") || line.endsWith("\n") ? 1 : 0;
  const contentEnd = line.length - endingLength;
  let end = contentEnd;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end -= 1;
  return end === contentEnd ? line : line.slice(0, end) + line.slice(contentEnd);
}

function normalized(line: string, options: LineDiffOptions): string {
  let result = line;
  if (options.ignoreTrailingWhitespace === true) {
    result = withoutTrailingBlanks(result);
  }
  if (options.ignoreLineEndings === true) {
    result = result.replace(/(?:\r\n|\r|\n)$/u, "");
  }
  return options.ignoreCase === true ? result.toLowerCase() : result;
}

function makeEqual(
  left: readonly string[],
  right: readonly string[],
  options: LineDiffOptions,
): (leftIndex: number, rightIndex: number) => boolean {
  return (leftIndex, rightIndex) =>
    normalized(left[leftIndex] as string, options) ===
    normalized(right[rightIndex] as string, options);
}

function choosePrevious(
  v: Int32Array,
  offset: number,
  distance: number,
  diagonal: number,
): number {
  const down = v[offset + diagonal + 1] as number;
  const right = v[offset + diagonal - 1] as number;
  return diagonal === -distance || (diagonal !== distance && right < down)
    ? down
    : right + 1;
}

function backtrack(
  trace: readonly Int32Array[],
  distance: number,
  leftLength: number,
  rightLength: number,
  offset: number,
): Edit[] {
  const reversed: Edit[] = [];
  let left = leftLength;
  let right = rightLength;
  for (let depth = distance; depth > 0; depth -= 1) {
    const previous = trace[depth - 1] as Int32Array;
    const diagonal = left - right;
    const down = previous[offset + diagonal + 1] as number;
    const across = previous[offset + diagonal - 1] as number;
    const previousDiagonal = diagonal === -depth ||
      (diagonal !== depth && across < down)
      ? diagonal + 1
      : diagonal - 1;
    const previousLeft = previous[offset + previousDiagonal] as number;
    const previousRight = previousLeft - previousDiagonal;
    while (left > previousLeft && right > previousRight) {
      reversed.push({ kind: "same", left: --left, right: --right });
    }
    if (left === previousLeft) {
      reversed.push({ kind: "added", right: --right });
    } else {
      reversed.push({ kind: "deleted", left: --left });
    }
  }
  return reversed.reverse();
}

function boundedMyers(
  leftLength: number,
  rightLength: number,
  equal: (leftIndex: number, rightIndex: number) => boolean,
): Edit[] | undefined {
  const limit = Math.min(leftLength + rightLength, MAX_EDIT_DISTANCE);
  const offset = limit + 1;
  const v = new Int32Array(offset * 2 + 1);
  v.fill(-1);
  v[offset + 1] = 0;
  const trace: Int32Array[] = [];
  let work = 0;
  for (let distance = 0; distance <= limit; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let left = choosePrevious(v, offset, distance, diagonal);
      let right = left - diagonal;
      work += 1;
      while (left < leftLength && right < rightLength && equal(left, right)) {
        left += 1;
        right += 1;
        work += 1;
      }
      v[offset + diagonal] = left;
      if (left >= leftLength && right >= rightLength) {
        trace.push(v.slice());
        return backtrack(trace, distance, leftLength, rightLength, offset);
      }
      if (work >= MAX_WORK) return undefined;
    }
    trace.push(v.slice());
  }
  return undefined;
}

function coarseEdits(leftLength: number, rightLength: number): Edit[] {
  const edits: Edit[] = [];
  for (let index = 0; index < leftLength; index += 1) {
    edits.push({ kind: "deleted", left: index });
  }
  for (let index = 0; index < rightLength; index += 1) {
    edits.push({ kind: "added", right: index });
  }
  return edits;
}

function appendUnchanged(
  hunks: DiffHunk[],
  leftStart: number,
  rightStart: number,
  lineCount: number,
): void {
  if (lineCount === 0) return;
  const last = hunks[hunks.length - 1];
  if (
    last?.kind === "unchanged" &&
    last.leftStart + last.lineCount === leftStart &&
    last.rightStart + last.lineCount === rightStart
  ) {
    hunks[hunks.length - 1] = { ...last, lineCount: last.lineCount + lineCount };
    return;
  }
  hunks.push({ kind: "unchanged", leftStart, rightStart, lineCount });
}

function changeLines(
  deleted: readonly number[],
  added: readonly number[],
  left: readonly string[],
  right: readonly string[],
): ChangedLine[] {
  const lines: ChangedLine[] = [];
  const count = Math.max(deleted.length, added.length);
  for (let index = 0; index < count; index += 1) {
    const leftIndex = deleted[index];
    const rightIndex = added[index];
    if (leftIndex !== undefined && rightIndex !== undefined) {
      lines.push({
        kind: "modified",
        leftLineNumber: leftIndex + 1,
        rightLineNumber: rightIndex + 1,
        left: left[leftIndex] as string,
        right: right[rightIndex] as string,
      });
    } else if (leftIndex !== undefined) {
      lines.push({
        kind: "deleted",
        leftLineNumber: leftIndex + 1,
        left: left[leftIndex] as string,
      });
    } else if (rightIndex !== undefined) {
      lines.push({
        kind: "added",
        rightLineNumber: rightIndex + 1,
        right: right[rightIndex] as string,
      });
    }
  }
  return lines;
}

function appendEdits(
  hunks: DiffHunk[],
  edits: readonly Edit[],
  left: readonly string[],
  right: readonly string[],
  leftOffset: number,
  rightOffset: number,
): void {
  const deleted: number[] = [];
  const added: number[] = [];
  const flush = (): void => {
    if (deleted.length + added.length > 0) {
      hunks.push({
        kind: "change",
        lines: changeLines(deleted, added, left, right),
      });
      deleted.length = 0;
      added.length = 0;
    }
  };
  for (const edit of edits) {
    if (edit.kind === "deleted") deleted.push(leftOffset + edit.left);
    if (edit.kind === "added") added.push(rightOffset + edit.right);
    if (edit.kind === "same") {
      flush();
      appendUnchanged(hunks, leftOffset + edit.left + 1, rightOffset + edit.right + 1, 1);
    }
  }
  flush();
}

export function diffLines(
  left: readonly string[],
  right: readonly string[],
  options: LineDiffOptions,
): readonly DiffHunk[] {
  const equal = makeEqual(left, right, options);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && equal(prefix, prefix)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    equal(left.length - suffix - 1, right.length - suffix - 1)
  ) suffix += 1;
  const leftLength = left.length - prefix - suffix;
  const rightLength = right.length - prefix - suffix;
  const middleEqual = (leftIndex: number, rightIndex: number): boolean =>
    equal(prefix + leftIndex, prefix + rightIndex);
  const edits = boundedMyers(leftLength, rightLength, middleEqual) ??
    coarseEdits(leftLength, rightLength);
  const hunks: DiffHunk[] = [];
  appendUnchanged(hunks, 1, 1, prefix);
  appendEdits(hunks, edits, left, right, prefix, prefix);
  appendUnchanged(
    hunks,
    left.length - suffix + 1,
    right.length - suffix + 1,
    suffix,
  );
  return hunks;
}
