import {
  diffLines,
  type ChangedLine,
  type DiffHunk,
} from "../../../shared/diff/lineDiff";
import { diffWords, type WordSpan } from "../../../shared/diff/wordDiff";
import type {
  CompareRow,
  CompareSide,
  CompareState,
  HighlightMode,
} from "../../../shared/workers/compare";

export type {
  CompareRow,
  CompareSide,
  CompareState,
  HighlightMode,
} from "../../../shared/workers/compare";

function oneSpan(text: string, kind: WordSpan["kind"]): readonly WordSpan[] {
  return text.length === 0 ? [] : [{ kind, text }];
}

function characterSpans(
  left: string,
  right: string,
): { left: readonly WordSpan[]; right: readonly WordSpan[] } {
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  let prefix = 0;
  while (leftCharacters[prefix] === rightCharacters[prefix] &&
    prefix < leftCharacters.length && prefix < rightCharacters.length) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < leftCharacters.length - prefix &&
    suffix < rightCharacters.length - prefix &&
    leftCharacters[leftCharacters.length - suffix - 1] ===
      rightCharacters[rightCharacters.length - suffix - 1]) {
    suffix += 1;
  }
  return {
    left: characterSide(leftCharacters, prefix, suffix),
    right: characterSide(rightCharacters, prefix, suffix),
  };
}

function characterSide(
  characters: readonly string[],
  prefix: number,
  suffix: number,
): readonly WordSpan[] {
  const changedEnd = characters.length - suffix;
  const spans: WordSpan[] = [];
  const append = (kind: WordSpan["kind"], text: string): void => {
    if (text.length > 0) spans.push({ kind, text });
  };
  append("same", characters.slice(0, prefix).join(""));
  append("changed", characters.slice(prefix, changedEnd).join(""));
  append("same", characters.slice(changedEnd).join(""));
  return spans;
}

function modifiedSpans(
  left: string,
  right: string,
  highlight: HighlightMode,
): { left: readonly WordSpan[]; right: readonly WordSpan[]; limited: boolean } {
  if (highlight === "words") {
    const result = diffWords(left, right, {});
    if (!result.limited) return { ...result, limited: false };
  }
  if (highlight === "characters") {
    return { ...characterSpans(left, right), limited: false };
  }
  const kind = highlight === "lines" ? "changed" : "same";
  return { left: oneSpan(left, kind), right: oneSpan(right, kind), limited: highlight === "words" };
}

function side(
  lineNumber: number,
  text: string,
  spans: readonly WordSpan[] = oneSpan(text, "same"),
): CompareSide {
  return { lineNumber, text, spans };
}

function changedRow(
  line: ChangedLine,
  changeIndex: number,
  highlight: HighlightMode,
): { row: CompareRow; limited: boolean } {
  if (line.kind === "deleted") {
    const kind = highlight === "none" ? "same" : "changed";
    return {
      row: {
        kind: "deleted",
        changeIndex,
        left: side(line.leftLineNumber, line.left, oneSpan(line.left, kind)),
      },
      limited: false,
    };
  }
  if (line.kind === "added") {
    const kind = highlight === "none" ? "same" : "changed";
    return {
      row: {
        kind: "added",
        changeIndex,
        right: side(line.rightLineNumber, line.right, oneSpan(line.right, kind)),
      },
      limited: false,
    };
  }
  const spans = modifiedSpans(line.left, line.right, highlight);
  return {
    row: {
      kind: "modified",
      changeIndex,
      left: side(line.leftLineNumber, line.left, spans.left),
      right: side(line.rightLineNumber, line.right, spans.right),
    },
    limited: spans.limited,
  };
}

function appendUnchanged(
  rows: CompareRow[],
  hunk: Extract<DiffHunk, { kind: "unchanged" }>,
  left: readonly string[],
  right: readonly string[],
): void {
  for (let offset = 0; offset < hunk.lineCount; offset += 1) {
    const leftNumber = hunk.leftStart + offset;
    const rightNumber = hunk.rightStart + offset;
    rows.push({
      kind: "unchanged",
      changeIndex: null,
      left: side(leftNumber, left[leftNumber - 1] ?? ""),
      right: side(rightNumber, right[rightNumber - 1] ?? ""),
    });
  }
}

export function createCompareState(
  leftText: string,
  rightText: string,
  highlight: HighlightMode,
): CompareState {
  const left = leftText.split("\n");
  const right = rightText.split("\n");
  const result = diffLines(left, right, {});
  const rows: CompareRow[] = [];
  let changeCount = 0;
  let limited = result.limited;
  for (const hunk of result.hunks) {
    if (hunk.kind === "unchanged") {
      appendUnchanged(rows, hunk, left, right);
      continue;
    }
    for (const line of hunk.lines) {
      const changed = changedRow(line, changeCount, highlight);
      rows.push(changed.row);
      limited = limited || changed.limited;
    }
    changeCount += 1;
  }
  return {
    rows,
    changeCount,
    selectedChange: changeCount === 0 ? -1 : 0,
    highlight,
    limited,
  };
}

export function moveDifference(
  state: CompareState,
  direction: 1 | -1,
): CompareState {
  if (state.changeCount === 0) return state;
  const selectedChange = (
    state.selectedChange + direction + state.changeCount
  ) % state.changeCount;
  return { ...state, selectedChange };
}
