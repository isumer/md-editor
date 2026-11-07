import { describe, expect, it } from "vitest";

import {
  diffLines,
  type DiffHunk,
} from "../../src/shared/diff/lineDiff";

function rebuild(
  hunks: readonly DiffHunk[],
  source: readonly string[],
  side: "left" | "right",
): string[] {
  const rebuilt: string[] = [];
  for (const hunk of hunks) {
    if (hunk.kind === "unchanged") {
      const start = side === "left" ? hunk.leftStart : hunk.rightStart;
      rebuilt.push(...source.slice(start - 1, start - 1 + hunk.lineCount));
      continue;
    }
    for (const line of hunk.lines) {
      if (side === "left" && line.kind !== "added") rebuilt.push(line.left);
      if (side === "right" && line.kind !== "deleted") rebuilt.push(line.right);
    }
  }
  return rebuilt;
}

function randomLines(seed: number): [string[], string[]] {
  let state = seed;
  const next = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state;
  };
  const make = (): string[] =>
    Array.from({ length: next() % 18 }, () => `line-${next() % 8}`);
  return [make(), make()];
}

describe("line diff", () => {
  it("AC-R14-01: reports added, deleted, and modified lines exactly", () => {
    const left = ["same", "old", "left only", "anchor", "tail"];
    const right = ["same", "new", "anchor", "right only", "tail"];

    expect(diffLines(left, right, {})).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
      {
        kind: "change",
        lines: [
          {
            kind: "modified",
            leftLineNumber: 2,
            rightLineNumber: 2,
            left: "old",
            right: "new",
          },
          { kind: "deleted", leftLineNumber: 3, left: "left only" },
        ],
      },
      { kind: "unchanged", leftStart: 4, rightStart: 3, lineCount: 1 },
      {
        kind: "change",
        lines: [
          { kind: "added", rightLineNumber: 4, right: "right only" },
        ],
      },
      { kind: "unchanged", leftStart: 5, rightStart: 5, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: ignores trailing whitespace only when enabled", () => {
    expect(diffLines(["value \t"], ["value"], {})).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
    expect(
      diffLines(["value \t"], ["value"], { ignoreTrailingWhitespace: true }),
    ).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: ignores case only when enabled", () => {
    expect(diffLines(["Value"], ["value"], {})).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
    expect(diffLines(["Value"], ["value"], { ignoreCase: true })).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: ignores CR, LF, and CRLF only when enabled", () => {
    const left = ["one\r", "two\n", "three\r\n"];
    const right = ["one\n", "two\r\n", "three\r"];

    expect(diffLines(left, right, {})).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 3 },
    ]);
    expect(diffLines(left, right, { ignoreLineEndings: true })).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 3 },
    ]);
  });

  it("AC-R14-09: preserves exact unchanged run counts around one change", () => {
    const left = Array.from({ length: 1_000 }, (_, index) => `line-${index}`);
    const right = [...left];
    right[499] = "changed";

    expect(diffLines(left, right, {})).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 499 },
      {
        kind: "change",
        lines: [
          {
            kind: "modified",
            leftLineNumber: 500,
            rightLineNumber: 500,
            left: "line-499",
            right: "changed",
          },
        ],
      },
      { kind: "unchanged", leftStart: 501, rightStart: 501, lineCount: 500 },
    ]);
  });

  it("boundary: returns no hunks for two empty inputs", () => {
    expect(diffLines([], [], {})).toEqual([]);
  });

  it("boundary: returns one unchanged run for identical inputs", () => {
    expect(diffLines(["a", "b"], ["a", "b"], {})).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 2 },
    ]);
  });

  it("boundary: pairs fully different inputs by position", () => {
    expect(diffLines(["a", "b"], ["x", "y"], {})).toEqual([
      {
        kind: "change",
        lines: [
          {
            kind: "modified",
            leftLineNumber: 1,
            rightLineNumber: 1,
            left: "a",
            right: "x",
          },
          {
            kind: "modified",
            leftLineNumber: 2,
            rightLineNumber: 2,
            left: "b",
            right: "y",
          },
        ],
      },
    ]);
  });

  it("boundary: reports every line when one side is empty", () => {
    expect(diffLines([], ["a", "b"], {})).toEqual([
      {
        kind: "change",
        lines: [
          { kind: "added", rightLineNumber: 1, right: "a" },
          { kind: "added", rightLineNumber: 2, right: "b" },
        ],
      },
    ]);
  });

  it("AC-R14-10: returns for a 200,000-line pair", () => {
    const left = Array.from({ length: 200_000 }, (_, index) => `line-${index}`);
    const right = left.map((line, index) =>
      index % 100 === 0 ? `changed-${index}` : line,
    );

    const hunks = diffLines(left, right, {});

    expect(hunks[0]).toMatchObject({ kind: "change" });
    expect(rebuild(hunks, left, "left")).toEqual(left);
    expect(rebuild(hunks, right, "right")).toEqual(right);
  });

  it("property: 200 seeded random pairs rebuild both inputs exactly", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const [left, right] = randomLines(seed);
      const hunks = diffLines(left, right, {});

      expect(rebuild(hunks, left, "left"), `left seed ${seed}`).toEqual(left);
      expect(rebuild(hunks, right, "right"), `right seed ${seed}`).toEqual(
        right,
      );
    }
  });
});
