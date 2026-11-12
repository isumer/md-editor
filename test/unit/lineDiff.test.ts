import { describe, expect, it } from "vitest";

import {
  diffLines,
  type DiffHunk,
  type LineDiffOptions,
} from "../../src/shared/diff/lineDiff";

function lineHunks(
  left: readonly string[],
  right: readonly string[],
  options: LineDiffOptions = {},
): readonly DiffHunk[] {
  return diffLines(left, right, options).hunks;
}

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

    expect(lineHunks(left, right)).toEqual([
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
    expect(lineHunks(["value \t"], ["value"])).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
    expect(
      lineHunks(["value \t"], ["value"], { ignoreTrailingWhitespace: true }),
    ).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: trims trailing whitespace without rescanning a long blank run", () => {
    const blanks = " ".repeat(40_000);
    expect(
      lineHunks([`${blanks}a \t\r\n`], [`${blanks}a\r\n`], {
        ignoreTrailingWhitespace: true,
      }),
    ).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: ignores case only when enabled", () => {
    expect(lineHunks(["Value"], ["value"])).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
    expect(lineHunks(["Value"], ["value"], { ignoreCase: true })).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
    ]);
  });

  it("AC-R14-08: ignores CR, LF, and CRLF only when enabled", () => {
    const left = ["one\r", "two\n", "three\r\n"];
    const right = ["one\n", "two\r\n", "three\r"];

    expect(lineHunks(left, right)).not.toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 3 },
    ]);
    expect(lineHunks(left, right, { ignoreLineEndings: true })).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 3 },
    ]);
  });

  it("AC-R14-09: preserves exact unchanged run counts around one change", () => {
    const left = Array.from({ length: 1_000 }, (_, index) => `line-${index}`);
    const right = [...left];
    right[499] = "changed";

    expect(lineHunks(left, right)).toEqual([
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

  it("AC-R14-09: reports one unchanged run between two changes", () => {
    const left = ["a", "old one", "keep 1", "keep 2", "keep 3", "old two", "z"];
    const right = ["a", "new one", "keep 1", "keep 2", "keep 3", "new two", "z"];

    expect(lineHunks(left, right)).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
      {
        kind: "change",
        lines: [
          {
            kind: "modified",
            leftLineNumber: 2,
            rightLineNumber: 2,
            left: "old one",
            right: "new one",
          },
        ],
      },
      { kind: "unchanged", leftStart: 3, rightStart: 3, lineCount: 3 },
      {
        kind: "change",
        lines: [
          {
            kind: "modified",
            leftLineNumber: 6,
            rightLineNumber: 6,
            left: "old two",
            right: "new two",
          },
        ],
      },
      { kind: "unchanged", leftStart: 7, rightStart: 7, lineCount: 1 },
    ]);
  });

  it("boundary: returns no hunks for two empty inputs", () => {
    expect(lineHunks([], [])).toEqual([]);
  });

  it("boundary: returns one unchanged run for identical inputs", () => {
    expect(lineHunks(["a", "b"], ["a", "b"])).toEqual([
      { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 2 },
    ]);
  });

  it("boundary: pairs fully different inputs by position", () => {
    expect(lineHunks(["a", "b"], ["x", "y"])).toEqual([
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
    expect(lineHunks([], ["a", "b"])).toEqual([
      {
        kind: "change",
        lines: [
          { kind: "added", rightLineNumber: 1, right: "a" },
          { kind: "added", rightLineNumber: 2, right: "b" },
        ],
      },
    ]);
  });

  it("empty anchored gaps keep exact hunks and do not report a limit", () => {
    expect(diffLines(["a", "x", "b"], ["a", "y", "b"], {})).toEqual({
      hunks: [
        { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
        {
          kind: "change",
          lines: [
            {
              kind: "modified",
              leftLineNumber: 2,
              rightLineNumber: 2,
              left: "x",
              right: "y",
            },
          ],
        },
        { kind: "unchanged", leftStart: 3, rightStart: 3, lineCount: 1 },
      ],
      limited: false,
    });
    expect(diffLines(["a", "b", "c"], ["a", "b", "c"], {})).toEqual({
      hunks: [
        { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 3 },
      ],
      limited: false,
    });
  });

  it("AC-R14-10: keeps every sparse large-file change exact", () => {
    const left = Array.from({ length: 200_000 }, (_, index) => `line-${index}`);
    const right = left.map((line, index) =>
      index % 100 === 0 ? `changed-${index}` : line,
    );

    const result = diffLines(left, right, {});
    const changes = result.hunks.filter((hunk) => hunk.kind === "change");

    expect(changes).toHaveLength(2_000);
    expect(changes.every((hunk) => hunk.lines.length === 1)).toBe(true);
    expect(changes.every((hunk) => hunk.lines[0]?.kind === "modified")).toBe(
      true,
    );
    expect(result.limited).toBe(false);
    expect(rebuild(result.hunks, left, "left")).toEqual(left);
    expect(rebuild(result.hunks, right, "right")).toEqual(right);
  });

  it("AC-R14-10: keeps sparse changes exact with normalised anchors", () => {
    const left = Array.from({ length: 200_000 }, (_, index) => `Line-${index}`);
    const right = left.map((line, index) =>
      index % 100 === 0 ? `other-${index}` : line.toLowerCase(),
    );

    const result = diffLines(left, right, { ignoreCase: true });
    const changes = result.hunks.filter((hunk) => hunk.kind === "change");

    expect(changes).toHaveLength(2_000);
    expect(
      changes.every(
        (hunk) => hunk.lines.length === 1 && hunk.lines[0]?.kind === "modified",
      ),
    ).toBe(true);
    expect(result.limited).toBe(false);
  });

  it("AC-R14-11: limits one oversized gap and keeps other gaps exact", () => {
    const leftGap = Array.from({ length: 257 }, (_, index) => `left-${index}`);
    const rightGap = Array.from(
      { length: 257 },
      (_, index) => `right-${index}`,
    );
    const left = ["before", ...leftGap, "anchor", "old", "after"];
    const right = ["before", ...rightGap, "anchor", "new", "after"];

    expect(diffLines(left, right, {})).toEqual({
      hunks: [
        { kind: "unchanged", leftStart: 1, rightStart: 1, lineCount: 1 },
        {
          kind: "change",
          lines: leftGap.map((line, index) => ({
            kind: "modified",
            leftLineNumber: index + 2,
            rightLineNumber: index + 2,
            left: line,
            right: rightGap[index],
          })),
        },
        {
          kind: "unchanged",
          leftStart: 259,
          rightStart: 259,
          lineCount: 1,
        },
        {
          kind: "change",
          lines: [
            {
              kind: "modified",
              leftLineNumber: 260,
              rightLineNumber: 260,
              left: "old",
              right: "new",
            },
          ],
        },
        {
          kind: "unchanged",
          leftStart: 261,
          rightStart: 261,
          lineCount: 1,
        },
      ],
      limited: true,
    });
  });

  it("AC-R14-11: limits work before the edit-distance bound", () => {
    const left = Array.from({ length: 500_000 }, (_, index) =>
      index % 2 === 0 ? "a" : "b",
    );
    const right = Array.from({ length: 500_000 }, (_, index) =>
      index % 2 === 0 ? "b" : "a",
    );

    expect(diffLines(left, right, {}).limited).toBe(true);
  });

  it("AC-R14-11: limits work inside one matching run", () => {
    const run = Array.from({ length: 1_000_000 }, () => "m");
    const left = ["a1", "D", ...run, "a2", "T1"];
    const right = ["a1", "E", ...run, "a2", "T2"];

    expect(diffLines(left, right, {}).limited).toBe(true);
  });

  it("property: 200 seeded random pairs rebuild both inputs exactly", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const [left, right] = randomLines(seed);
      const { hunks } = diffLines(left, right, {});

      expect(rebuild(hunks, left, "left"), `left seed ${seed}`).toEqual(left);
      expect(rebuild(hunks, right, "right"), `right seed ${seed}`).toEqual(
        right,
      );
    }
  });
});
