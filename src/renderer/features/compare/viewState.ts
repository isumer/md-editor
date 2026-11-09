import {
  diffLines,
  type ChangedLine,
  type DiffHunk,
} from "../../../shared/diff/lineDiff";
import { diffWords, type WordSpan } from "../../../shared/diff/wordDiff";

export interface CompareCell {
  readonly lineNumber: number;
  readonly text: string;
  readonly spans: readonly WordSpan[];
  readonly characterSpans: readonly WordSpan[];
}

export interface CompareRow {
  readonly kind: "unchanged" | ChangedLine["kind"];
  readonly left?: CompareCell;
  readonly right?: CompareCell;
  readonly difference?: number;
}

export interface CompareViewState {
  readonly rows: readonly CompareRow[];
  readonly changeCount: number;
  readonly activeDifference: number;
  readonly limited: boolean;
}

function sameCell(lineNumber: number, text: string): CompareCell {
  const spans = text.length === 0 ? [] : [{ kind: "same" as const, text }];
  return { lineNumber, text, spans, characterSpans: spans };
}

function changedCell(lineNumber: number, text: string): CompareCell {
  const spans = text.length === 0 ? [] : [{ kind: "changed" as const, text }];
  return { lineNumber, text, spans, characterSpans: spans };
}

function characterSpans(
  text: string,
  prefix: number,
  suffix: number,
): WordSpan[] {
  const characters = Array.from(text);
  const spans: WordSpan[] = [];
  if (prefix > 0) {
    spans.push({ kind: "same", text: characters.slice(0, prefix).join("") });
  }
  const changedEnd = characters.length - suffix;
  if (changedEnd > prefix) {
    spans.push({ kind: "changed", text: characters.slice(prefix, changedEnd).join("") });
  }
  if (suffix > 0) {
    spans.push({ kind: "same", text: characters.slice(changedEnd).join("") });
  }
  return spans;
}

function characterDiff(left: string, right: string): readonly [WordSpan[], WordSpan[]] {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  let prefix = 0;
  while (leftCharacters[prefix] === rightCharacters[prefix] &&
    prefix < leftCharacters.length && prefix < rightCharacters.length) prefix += 1;
  let suffix = 0;
  while (leftCharacters[leftCharacters.length - suffix - 1] ===
      rightCharacters[rightCharacters.length - suffix - 1] &&
    suffix < leftCharacters.length - prefix &&
    suffix < rightCharacters.length - prefix) suffix += 1;
  return [
    characterSpans(left, prefix, suffix),
    characterSpans(right, prefix, suffix),
  ];
}

function modifiedRow(line: Extract<ChangedLine, { kind: "modified" }>): CompareRow {
  const words = diffWords(line.left, line.right, {});
  const characters = characterDiff(line.left, line.right);
  return {
    kind: "modified",
    left: words.limited
      ? changedCell(line.leftLineNumber, line.left)
      : {
          lineNumber: line.leftLineNumber,
          text: line.left,
          spans: words.left,
          characterSpans: characters[0],
        },
    right: words.limited
      ? changedCell(line.rightLineNumber, line.right)
      : {
          lineNumber: line.rightLineNumber,
          text: line.right,
          spans: words.right,
          characterSpans: characters[1],
        },
  };
}

function changedRow(line: ChangedLine): CompareRow {
  if (line.kind === "modified") return modifiedRow(line);
  if (line.kind === "deleted") {
    return {
      kind: line.kind,
      left: changedCell(line.leftLineNumber, line.left),
    };
  }
  return {
    kind: line.kind,
    right: changedCell(line.rightLineNumber, line.right),
  };
}

function unchangedRows(
  hunk: Extract<DiffHunk, { kind: "unchanged" }>,
  left: readonly string[],
  right: readonly string[],
): CompareRow[] {
  return Array.from({ length: hunk.lineCount }, (_, offset) => {
    const leftLineNumber = hunk.leftStart + offset;
    const rightLineNumber = hunk.rightStart + offset;
    return {
      kind: "unchanged",
      left: sameCell(leftLineNumber, left[leftLineNumber - 1] ?? ""),
      right: sameCell(rightLineNumber, right[rightLineNumber - 1] ?? ""),
    };
  });
}

export function createCompareViewState(
  left: readonly string[],
  right: readonly string[],
): CompareViewState {
  const result = diffLines(left, right, {});
  const rows: CompareRow[] = [];
  let difference = 0;
  for (const hunk of result.hunks) {
    if (hunk.kind === "unchanged") {
      rows.push(...unchangedRows(hunk, left, right));
      continue;
    }
    rows.push(...hunk.lines.map((line) => ({
      ...changedRow(line),
      difference,
    })));
    difference += 1;
  }
  return {
    rows,
    changeCount: difference,
    activeDifference: difference === 0 ? -1 : 0,
    limited: result.limited,
  };
}

export function moveToDifference(
  state: CompareViewState,
  direction: 1 | -1,
): CompareViewState {
  if (state.changeCount === 0) return state;
  const activeDifference = (
    state.activeDifference + direction + state.changeCount
  ) % state.changeCount;
  return { ...state, activeDifference };
}
