import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createThreeWayMerge,
  type ThreeWayMergeResult,
} from "../../src/renderer/features/merge/threeWayMerge";
import {
  acceptChunk,
  applyNonConflicting,
  createMergeState,
  type MergeStep,
  type TextEdit,
} from "../../src/shared/merge/mergeChunks";

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  for (const edit of [...edits].reverse()) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

function applyStep(text: string, step: MergeStep): string {
  return applyEdits(text, step.edits);
}

function resolvedText(result: ThreeWayMergeResult): string {
  let state = createMergeState(result.chunks);
  let text = applyStep(result.base, applyNonConflicting(state));
  state = applyNonConflicting(state).state;
  for (let index = 0; index < state.chunks.length; index += 1) {
    if (state.chunks[index]?.kind !== "conflict") continue;
    const step = acceptChunk(state, index, "left");
    text = applyStep(text, step);
    state = step.state;
  }
  return text;
}

describe("three-way merge", () => {
  it("AC-R15-01: empty and unterminated inputs keep exact text", () => {
    expect(createThreeWayMerge("", "", "").chunks).toEqual([]);
    expect(resolvedText(createThreeWayMerge("base", "left", "base"))).toBe("left");
  });

  it.each([
    {
      name: "clean edits",
      base: "one\ntwo\nthree\n",
      left: "ONE\ntwo\nthree\n",
      right: "one\ntwo\nTHREE\n",
      expected: "ONE\ntwo\nTHREE\n",
      conflicts: 0,
    },
    {
      name: "adjacent edits",
      base: "one\ntwo\nthree\n",
      left: "ONE\ntwo\nthree\n",
      right: "one\nTWO\nthree\n",
      expected: "ONE\nTWO\nthree\n",
      conflicts: 0,
    },
    {
      name: "same edit",
      base: "one\ntwo\n",
      left: "ONE\ntwo\n",
      right: "ONE\ntwo\n",
      expected: "ONE\ntwo\n",
      conflicts: 0,
    },
    {
      name: "real conflict",
      base: "one\ntwo\n",
      left: "LEFT\ntwo\n",
      right: "RIGHT\ntwo\n",
      expected: "LEFT\ntwo\n",
      conflicts: 1,
    },
    {
      name: "insert at end",
      base: "one\n",
      left: "one\nleft\n",
      right: "one\n",
      expected: "one\nleft\n",
      conflicts: 0,
    },
    {
      name: "deleted versus modified",
      base: "one\ntwo\n",
      left: "two\n",
      right: "ONE\ntwo\n",
      expected: "two\n",
      conflicts: 1,
    },
  ])("AC-R15-01: $name reports the expected result", (fixture) => {
    const result = createThreeWayMerge(fixture.base, fixture.left, fixture.right);

    expect(result.conflictCount).toBe(fixture.conflicts);
    expect(resolvedText(result)).toBe(fixture.expected);
  });

  it("AC-R15-02: the same edit appears once and is not a conflict", () => {
    const result = createThreeWayMerge("a\nold\nz\n", "a\nnew\nz\n", "a\nnew\nz\n");

    expect(result.chunks).toEqual([
      { kind: "change", start: 2, end: 6, left: "new\n", right: "new\n" },
    ]);
    expect(result.conflictCount).toBe(0);
    expect(resolvedText(result)).toBe("a\nnew\nz\n");
  });

  it("keeps transitively overlapping side changes in one conflict", () => {
    const base = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
    const left = "L0\nL1\n2\nL3\nL4\nL5\n6\nL7\nL8\nL9\n10\n";
    const right = "0\nR1\nR2\nR3\n4\nR5\nR6\nR7\n8\n9\n10\n";

    const result = createThreeWayMerge(base, left, right);

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.kind).toBe("conflict");
  });

  it("AC-R15-01: keeps a long alternating overlap chain in one conflict", () => {
    const base = Array.from(
      { length: 20 },
      (_value, index) => `${String(index)}\n`,
    ).join("");
    const lines = base.split(/(?<=\n)/);
    const left = [...lines];
    const right = [...lines];
    const leftChanges = [
      [0, 3, "L1"],
      [6, 9, "L2"],
      [10, 13, "L3"],
      [14, 17, "L4"],
    ] as const;
    for (const [start, end, label] of leftChanges) {
      const replacements = Array.from({ length: end - start }, () => `${label}\n`);
      left.splice(start, end - start, ...replacements);
    }
    const rightChanges = [
      [2, 7, "R1"],
      [8, 11, "R2"],
      [12, 15, "R3"],
    ] as const;
    for (const [start, end, label] of rightChanges) {
      const replacements = Array.from({ length: end - start }, () => `${label}\n`);
      right.splice(start, end - start, ...replacements);
    }

    const result = createThreeWayMerge(base, left.join(""), right.join(""));

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.kind).toBe("conflict");
  });

  it("treats an insertion at a modified range boundary as a conflict", () => {
    const result = createThreeWayMerge(
      "one\ntwo\n",
      "added\none\ntwo\n",
      "ONE\ntwo\n",
    );

    expect(result.conflictCount).toBe(1);
    expect(result.chunks).toHaveLength(1);
  });

  it("AC-R15-01: the committed fixture has five changes and two conflicts", async () => {
    const fixtureDirectory = path.resolve("test/fixtures/merge");
    const [base, left, right] = await Promise.all([
      fs.readFile(path.join(fixtureDirectory, "base.txt"), "utf8"),
      fs.readFile(path.join(fixtureDirectory, "left.txt"), "utf8"),
      fs.readFile(path.join(fixtureDirectory, "right.txt"), "utf8"),
    ]);

    const result = createThreeWayMerge(base, left, right);

    expect(result.chunks.filter((chunk) => chunk.kind === "change")).toHaveLength(5);
    expect(result.chunks.filter((chunk) => chunk.kind === "conflict")).toHaveLength(2);
    expect(result.conflictCount).toBe(2);
  });
});
