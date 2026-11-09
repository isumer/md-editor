import { describe, expect, it } from "vitest";

import {
  createCompareViewState,
  moveToDifference,
} from "../../src/renderer/features/compare/viewState";

describe("compare view state", () => {
  it("AC-R14-01 AC-R14-02: aligns line changes and marks changed words", () => {
    const state = createCompareViewState(
      ["same", "old value", "left only", "end"],
      ["same", "new value", "right one", "right two", "end"],
    );

    expect(state.changeCount).toBe(1);
    expect(state.rows.map((row) => row.kind)).toEqual([
      "unchanged",
      "modified",
      "modified",
      "added",
      "unchanged",
    ]);
    expect(state.rows[1]?.left?.spans).toEqual([
      { kind: "changed", text: "old" },
      { kind: "same", text: " value" },
    ]);
    expect(state.rows[1]?.right?.spans).toEqual([
      { kind: "changed", text: "new" },
      { kind: "same", text: " value" },
    ]);
    expect(state.rows[1]?.right?.characterSpans).toEqual([
      { kind: "changed", text: "new" },
      { kind: "same", text: " value" },
    ]);
  });

  it("AC-R14-07: next and previous difference wrap across change hunks", () => {
    const initial = createCompareViewState(
      ["before", "left", "middle", "old", "after"],
      ["before", "right", "middle", "new", "after"],
    );

    const next = moveToDifference(initial, 1);
    const wrapped = moveToDifference(next, 1);
    const previous = moveToDifference(wrapped, -1);

    expect(initial.activeDifference).toBe(0);
    expect(next.activeDifference).toBe(1);
    expect(wrapped.activeDifference).toBe(0);
    expect(previous.activeDifference).toBe(1);
  });

  it("AC-R14-01: keeps added and deleted lines on their respective sides", () => {
    const added = createCompareViewState(["same"], ["same", "right only"]);
    const deleted = createCompareViewState(["same", "left only"], ["same"]);

    expect(added.rows[1]).toMatchObject({
      kind: "added",
      right: { lineNumber: 2, text: "right only" },
    });
    expect(added.rows[1]?.left).toBeUndefined();
    expect(deleted.rows[1]).toMatchObject({
      kind: "deleted",
      left: { lineNumber: 2, text: "left only" },
    });
    expect(deleted.rows[1]?.right).toBeUndefined();
  });
});
