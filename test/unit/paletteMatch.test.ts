import { describe, expect, it } from "vitest";

import {
  matchTitle,
  rankCommands,
  type PaletteEntry,
} from "../../src/shared/commands/paletteMatch";

describe("AC-R13-06: command palette matching", () => {
  it("AC-R13-06: matches a subsequence case-insensitively", () => {
    expect(matchTitle("oF", "Open File")).toEqual({
      score: 12,
      positions: [0, 5],
    });
  });

  it("AC-R13-06: scores consecutive characters", () => {
    expect(matchTitle("ope", "Open")).toEqual({
      score: 14,
      positions: [0, 1, 2],
    });
  });

  it("AC-R13-06: uses the leftmost greedy match", () => {
    expect(matchTitle("ab", "xaab")).toEqual({
      score: 2,
      positions: [1, 3],
    });
  });

  it("AC-R13-06: ignores whitespace in the query", () => {
    expect(matchTitle(" o\tF\n", "Open File")).toEqual({
      score: 12,
      positions: [0, 5],
    });
    expect(matchTitle(" \t\n", "Open File")).toEqual({
      score: 0,
      positions: [],
    });
  });

  it("AC-R13-06: returns no match for a missing character", () => {
    expect(matchTitle("oz", "Open File")).toBeUndefined();
  });

  it("AC-R13-06: ranks higher scores first", () => {
    const matches = rankCommands("ab", [
      { id: "consecutive", title: "ab" },
      { id: "word-starts", title: "a b" },
    ]);

    expect(matches).toEqual([
      { id: "word-starts", title: "a b", score: 12, positions: [0, 2] },
      { id: "consecutive", title: "ab", score: 10, positions: [0, 1] },
    ]);
  });

  it("AC-R13-06: ranks a recent id before a non-recent id", () => {
    const matches = rankCommands(
      "x",
      [
        { id: "older", title: "x" },
        { id: "recent", title: "x" },
      ],
      ["recent"],
    );

    expect(matches.map(({ id }) => id)).toEqual(["recent", "older"]);
  });

  it("AC-R13-06: ranks earlier recent ids first", () => {
    const matches = rankCommands(
      "x",
      [
        { id: "second", title: "x" },
        { id: "first", title: "x" },
      ],
      ["first", "second"],
    );

    expect(matches.map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("AC-R13-06: ranks titles in code-unit order", () => {
    const matches = rankCommands("", [
      { id: "beta", title: "Beta" },
      { id: "alpha", title: "Alpha" },
    ]);

    expect(matches.map(({ id }) => id)).toEqual(["alpha", "beta"]);
  });

  it("AC-R13-06: ranks ids in code-unit order", () => {
    const matches = rankCommands("", [
      { id: "z-id", title: "Same" },
      { id: "a-id", title: "Same" },
    ]);

    expect(matches.map(({ id }) => id)).toEqual(["a-id", "z-id"]);
  });

  it("AC-R13-06: lists recent commands first for an empty query", () => {
    const matches = rankCommands(
      "",
      [
        { id: "alpha", title: "Alpha" },
        { id: "second", title: "Zulu" },
        { id: "first", title: "Zulu" },
      ],
      ["first", "second"],
    );

    expect(matches).toEqual([
      { id: "first", title: "Zulu", score: 0, positions: [] },
      { id: "second", title: "Zulu", score: 0, positions: [] },
      { id: "alpha", title: "Alpha", score: 0, positions: [] },
    ]);
  });

  it("AC-R13-06: keeps the first entry for a duplicate id", () => {
    const matches = rankCommands("f", [
      { id: "duplicate", title: "First" },
      { id: "duplicate", title: "Final" },
    ]);

    expect(matches).toEqual([
      { id: "duplicate", title: "First", score: 6, positions: [0] },
    ]);
  });

  it("AC-R13-06: applies the limit", () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      id: `id-${String(index).padStart(2, "0")}`,
      title: `Title ${String(index).padStart(2, "0")}`,
    }));

    expect(rankCommands("", entries)).toHaveLength(50);
    expect(rankCommands("", entries, [], 3)).toHaveLength(3);
    expect(rankCommands("", entries, [], 0)).toEqual([]);
    expect(rankCommands("", entries, [], -1)).toEqual([]);
    expect(rankCommands("", entries, [], 2.5)).toEqual([]);
  });

  it("AC-R13-06: never changes the inputs", () => {
    const first = Object.freeze({ id: "first", title: "First" });
    const second = Object.freeze({ id: "second", title: "Second" });
    const entries: readonly PaletteEntry[] = Object.freeze([second, first]);
    const recentIds = Object.freeze(["first"]);

    expect(rankCommands("", entries, recentIds)).toEqual([
      { id: "first", title: "First", score: 0, positions: [] },
      { id: "second", title: "Second", score: 0, positions: [] },
    ]);
    expect(entries).toEqual([second, first]);
    expect(recentIds).toEqual(["first"]);
  });

  it("AC-R13-06: handles Unicode letters", () => {
    expect(matchTitle("ä", "xÄ")).toEqual({ score: 1, positions: [1] });
  });
});
