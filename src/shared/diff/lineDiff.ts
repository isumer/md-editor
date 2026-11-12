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

export interface LineDiffResult {
  readonly hunks: readonly DiffHunk[];
  readonly limited: boolean;
}

type Edit =
  | { readonly kind: "same"; readonly left: number; readonly right: number }
  | { readonly kind: "deleted"; readonly left: number }
  | { readonly kind: "added"; readonly right: number };

type LineRange = readonly [start: number, end: number];
type Anchor = readonly [left: number, right: number];
interface DiffInput {
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly options: LineDiffOptions;
}
type Gap = readonly [left: LineRange, right: LineRange];
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

function uniqueIndexes(
  lines: readonly string[],
  range: LineRange,
  options: LineDiffOptions,
): Map<string, number> {
  const indexes = new Map<string, number>();
  for (let index = range[0]; index < range[1]; index += 1) {
    const key = normalized(lines[index] as string, options);
    indexes.set(key, indexes.has(key) ? -1 : index);
  }
  return indexes;
}

function anchorCandidates(
  input: DiffInput,
  leftRange: LineRange,
  rightRange: LineRange,
): Anchor[] {
  const leftIndexes = uniqueIndexes(input.left, leftRange, input.options);
  const rightIndexes = uniqueIndexes(input.right, rightRange, input.options);
  const anchors: Anchor[] = [];
  for (const [line, left] of leftIndexes) {
    const right = rightIndexes.get(line);
    if (left >= 0 && right !== undefined && right >= 0) {
      anchors.push([left, right]);
    }
  }
  return anchors;
}

function increasingAnchors(candidates: readonly Anchor[]): Anchor[] {
  const tails: number[] = [];
  const previous = new Int32Array(candidates.length);
  previous.fill(-1);
  for (let index = 0; index < candidates.length; index += 1) {
    const anchor = candidates[index] as Anchor;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const tail = candidates[tails[middle] as number] as Anchor;
      if (tail[1] < anchor[1]) low = middle + 1;
      else high = middle;
    }
    const position = low;
    if (position > 0) previous[index] = tails[position - 1] as number;
    tails[position] = index;
  }
  const anchors: Anchor[] = [];
  let index = tails[tails.length - 1] ?? -1;
  while (index >= 0) {
    anchors.push(candidates[index] as Anchor);
    index = previous[index] as number;
  }
  return anchors.reverse();
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
  while (left > 0 && right > 0) {
    reversed.push({ kind: "same", left: --left, right: --right });
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
      if (work >= MAX_WORK) return undefined;
      while (left < leftLength && right < rightLength && equal(left, right)) {
        left += 1;
        right += 1;
        work += 1;
        if (work >= MAX_WORK) return undefined;
      }
      v[offset + diagonal] = left;
      if (left >= leftLength && right >= rightLength) {
        trace.push(v.slice());
        return backtrack(trace, distance, leftLength, rightLength, offset);
      }
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
  input: DiffInput,
  gap: Gap,
): void {
  const deleted: number[] = [];
  const added: number[] = [];
  const flush = (): void => {
    if (deleted.length + added.length > 0) {
      hunks.push({
        kind: "change",
        lines: changeLines(deleted, added, input.left, input.right),
      });
      deleted.length = 0;
      added.length = 0;
    }
  };
  for (const edit of edits) {
    if (edit.kind === "deleted") deleted.push(gap[0][0] + edit.left);
    if (edit.kind === "added") added.push(gap[1][0] + edit.right);
    if (edit.kind === "same") {
      flush();
      appendUnchanged(
        hunks,
        gap[0][0] + edit.left + 1,
        gap[1][0] + edit.right + 1,
        1,
      );
    }
  }
  flush();
}

function appendGap(hunks: DiffHunk[], input: DiffInput, gap: Gap): boolean {
  const leftLength = gap[0][1] - gap[0][0];
  const rightLength = gap[1][1] - gap[1][0];
  const equal = (left: number, right: number): boolean =>
    normalized(input.left[gap[0][0] + left] as string, input.options) ===
    normalized(input.right[gap[1][0] + right] as string, input.options);
  const exact = boundedMyers(leftLength, rightLength, equal);
  appendEdits(
    hunks,
    exact ?? coarseEdits(leftLength, rightLength),
    input,
    gap,
  );
  return exact === undefined;
}

function appendAlignedChange(
  hunks: DiffHunk[],
  input: DiffInput,
  left: number,
  right: number,
): void {
  hunks.push({
    kind: "change",
    lines: [{
      kind: "modified",
      leftLineNumber: left + 1,
      rightLineNumber: right + 1,
      left: input.left[left] as string,
      right: input.right[right] as string,
    }],
  });
}

function appendSparseAligned(
  hunks: DiffHunk[],
  input: DiffInput,
  middle: Gap,
): boolean {
  const leftLength = middle[0][1] - middle[0][0];
  const rightLength = middle[1][1] - middle[1][0];
  if (
    leftLength !== rightLength ||
    leftLength === 0 ||
    leftLength >= MAX_WORK
  ) return false;
  const differs = (index: number): boolean =>
    normalized(input.left[middle[0][0] + index] as string, input.options) !==
    normalized(input.right[middle[1][0] + index] as string, input.options);
  let changes = 0;
  let previousChanged = false;
  for (let index = 0; index < leftLength; index += 1) {
    const changed = differs(index);
    if (changed && previousChanged) return false;
    if (changed) changes += 1;
    previousChanged = changed;
  }
  if (changes * 8 > leftLength) return false;
  let unchangedStart = 0;
  for (let index = 0; index < leftLength; index += 1) {
    const left = middle[0][0] + index;
    const right = middle[1][0] + index;
    if (differs(index)) {
      appendUnchanged(
        hunks,
        middle[0][0] + unchangedStart + 1,
        middle[1][0] + unchangedStart + 1,
        index - unchangedStart,
      );
      appendAlignedChange(hunks, input, left, right);
      unchangedStart = index + 1;
    }
  }
  appendUnchanged(
    hunks,
    middle[0][0] + unchangedStart + 1,
    middle[1][0] + unchangedStart + 1,
    leftLength - unchangedStart,
  );
  return true;
}

function appendMiddle(
  hunks: DiffHunk[],
  input: DiffInput,
  middle: Gap,
): boolean {
  if (appendSparseAligned(hunks, input, middle)) return false;
  const anchors = increasingAnchors(anchorCandidates(input, middle[0], middle[1]));
  let leftStart = middle[0][0];
  let rightStart = middle[1][0];
  let limited = false;
  for (const anchor of anchors) {
    limited = appendGap(hunks, input, [
      [leftStart, anchor[0]],
      [rightStart, anchor[1]],
    ]) || limited;
    appendUnchanged(hunks, anchor[0] + 1, anchor[1] + 1, 1);
    leftStart = anchor[0] + 1;
    rightStart = anchor[1] + 1;
  }
  return appendGap(hunks, input, [
    [leftStart, middle[0][1]],
    [rightStart, middle[1][1]],
  ]) || limited;
}

export function diffLines(
  left: readonly string[],
  right: readonly string[],
  options: LineDiffOptions,
): LineDiffResult {
  const input = { left, right, options };
  const equal = (leftIndex: number, rightIndex: number): boolean =>
    normalized(left[leftIndex] as string, options) ===
    normalized(right[rightIndex] as string, options);
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
  const hunks: DiffHunk[] = [];
  appendUnchanged(hunks, 1, 1, prefix);
  const limited = appendMiddle(hunks, input, [
    [prefix, left.length - suffix],
    [prefix, right.length - suffix],
  ]);
  appendUnchanged(
    hunks,
    left.length - suffix + 1,
    right.length - suffix + 1,
    suffix,
  );
  return { hunks, limited };
}
