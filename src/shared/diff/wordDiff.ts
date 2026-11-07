export interface WordDiffOptions {
  readonly workLimit?: number;
}

export interface WordSpan {
  readonly kind: "same" | "changed";
  readonly text: string;
}

export type WordDiffResult =
  | {
      readonly limited: false;
      readonly left: readonly WordSpan[];
      readonly right: readonly WordSpan[];
    }
  | { readonly limited: true };

type TokenEdit =
  | { readonly kind: "same"; readonly left: string; readonly right: string }
  | { readonly kind: "left"; readonly text: string }
  | { readonly kind: "right"; readonly text: string };

const DEFAULT_WORK_LIMIT = 100_000;

function tokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu) ?? [];
}

function lcsRows(left: readonly string[], right: readonly string[]): Uint32Array[] {
  const rows = Array.from(
    { length: left.length + 1 },
    () => new Uint32Array(right.length + 1),
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const row = rows[leftIndex] as Uint32Array;
    const previous = rows[leftIndex - 1] as Uint32Array;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? (previous[rightIndex - 1] as number) + 1
        : Math.max(
            previous[rightIndex] as number,
            row[rightIndex - 1] as number,
          );
    }
  }
  return rows;
}

function backtrackTokens(
  left: readonly string[],
  right: readonly string[],
  rows: readonly Uint32Array[],
): TokenEdit[] {
  const edits: TokenEdit[] = [];
  let leftIndex = left.length;
  let rightIndex = right.length;
  while (leftIndex > 0 || rightIndex > 0) {
    const leftToken = left[leftIndex - 1] as string | undefined;
    const rightToken = right[rightIndex - 1] as string | undefined;
    if (leftToken !== undefined && rightToken !== undefined && leftToken === rightToken) {
      edits.push({ kind: "same", left: leftToken, right: rightToken });
      leftIndex -= 1;
      rightIndex -= 1;
      continue;
    }
    const above = leftIndex === 0
      ? 0
      : (rows[leftIndex - 1] as Uint32Array)[rightIndex] as number;
    const beside = rightIndex === 0
      ? 0
      : (rows[leftIndex] as Uint32Array)[rightIndex - 1] as number;
    if (leftIndex > 0 && (rightIndex === 0 || above >= beside)) {
      edits.push({ kind: "left", text: leftToken as string });
      leftIndex -= 1;
    } else {
      edits.push({ kind: "right", text: rightToken as string });
      rightIndex -= 1;
    }
  }
  return edits.reverse();
}

function appendSpan(spans: WordSpan[], kind: WordSpan["kind"], text: string): void {
  const previous = spans[spans.length - 1];
  if (previous?.kind === kind) {
    spans[spans.length - 1] = { kind, text: previous.text + text };
  } else if (text.length > 0) {
    spans.push({ kind, text });
  }
}

function spans(edits: readonly TokenEdit[], side: "left" | "right"): WordSpan[] {
  const result: WordSpan[] = [];
  for (const edit of edits) {
    if (edit.kind === "same") appendSpan(result, "same", edit[side]);
    if (edit.kind === side) appendSpan(result, "changed", edit.text);
  }
  return result;
}

export function diffWords(
  left: string,
  right: string,
  options: WordDiffOptions,
): WordDiffResult {
  if (left === right) {
    const same = left.length === 0 ? [] : [{ kind: "same" as const, text: left }];
    return { limited: false, left: same, right: same };
  }
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const workLimit = options.workLimit ?? DEFAULT_WORK_LIMIT;
  if (leftTokens.length * rightTokens.length > workLimit) {
    return { limited: true };
  }
  const rows = lcsRows(leftTokens, rightTokens);
  const edits = backtrackTokens(leftTokens, rightTokens, rows);
  return {
    limited: false,
    left: spans(edits, "left"),
    right: spans(edits, "right"),
  };
}
