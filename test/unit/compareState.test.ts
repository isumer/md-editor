import { describe, expect, it } from "vitest";

import {
  createCompareState,
  moveDifference,
} from "../../src/renderer/features/compare/state";

describe("compare view state", () => {
  it("AC-R14-01: aligns added, deleted and modified lines in two columns", () => {
    const state = createCompareState(
      "same\nold word\ndeleted\nend",
      "same\nnew word\nend\nadded",
      "words",
    );

    expect(state.rows.map((row) => ({
      kind: row.kind,
      left: row.left?.text,
      right: row.right?.text,
    }))).toEqual([
      { kind: "unchanged", left: "same", right: "same" },
      { kind: "modified", left: "old word", right: "new word" },
      { kind: "deleted", left: "deleted", right: undefined },
      { kind: "unchanged", left: "end", right: "end" },
      { kind: "added", left: undefined, right: "added" },
    ]);
    expect(state.changeCount).toBe(2);
  });

  it("AC-R14-02: marks only changed words in words mode", () => {
    const state = createCompareState(
      "The quick brown fox jumps.",
      "The quick brown cat jumps.",
      "words",
    );
    const row = state.rows[0];

    expect(row?.left?.spans).toEqual([
      { kind: "same", text: "The quick brown " },
      { kind: "changed", text: "fox" },
      { kind: "same", text: " jumps." },
    ]);
    expect(row?.right?.spans).toEqual([
      { kind: "same", text: "The quick brown " },
      { kind: "changed", text: "cat" },
      { kind: "same", text: " jumps." },
    ]);
  });

  it("AC-R14-02: changes character, line and none highlights", () => {
    const characters = createCompareState("Version 2,", "Version 2;", "characters");
    const lines = createCompareState("left", "right", "lines");
    const none = createCompareState("left", "right", "none");

    expect(characters.rows[0]?.left?.spans).toEqual([
      { kind: "same", text: "Version 2" },
      { kind: "changed", text: "," },
    ]);
    expect(characters.rows[0]?.right?.spans).toEqual([
      { kind: "same", text: "Version 2" },
      { kind: "changed", text: ";" },
    ]);
    expect(lines.rows[0]?.left?.spans).toEqual([{ kind: "changed", text: "left" }]);
    expect(none.rows[0]?.left?.spans).toEqual([{ kind: "same", text: "left" }]);
  });

  it("AC-R14-07: moves to next and previous differences with wrapping", () => {
    const state = createCompareState("one\ntwo\nthree", "ONE\ntwo\nTHREE", "words");

    expect(moveDifference(state, 1).selectedChange).toBe(1);
    expect(moveDifference(moveDifference(state, 1), 1).selectedChange).toBe(0);
    expect(moveDifference(state, -1).selectedChange).toBe(1);
  });

  it("keeps empty text and unchanged selection stable", () => {
    const state = createCompareState("", "", "words");

    expect(state.rows[0]?.left?.spans).toEqual([]);
    expect(state.selectedChange).toBe(-1);
    expect(moveDifference(state, 1)).toBe(state);
  });

  it("uses unchanged spans for added and deleted lines in none mode", () => {
    const deleted = createCompareState("same\ndeleted\nend", "same\nend", "none");
    const added = createCompareState("same\nend", "same\nadded\nend", "none");

    expect(deleted.rows.find((row) => row.kind === "deleted")?.left?.spans)
      .toEqual([{ kind: "same", text: "deleted" }]);
    expect(added.rows.find((row) => row.kind === "added")?.right?.spans)
      .toEqual([{ kind: "same", text: "added" }]);
  });
});
