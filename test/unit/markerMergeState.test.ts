import { describe, expect, it } from "vitest";

import {
  createMarkerMergeState,
  resolveMarkerConflict,
  undoMarkerConflict,
} from "../../src/renderer/features/merge/markerMergeState";

const markedText = [
  "before",
  "<<<<<<< left",
  "left one",
  "=======",
  "right one",
  ">>>>>>> right",
  "between",
  "<<<<<<< left",
  "left two",
  "=======",
  "right two",
  ">>>>>>> right",
  "after",
  "",
].join("\n");

describe("marker merge state", () => {
  it("AC-R15-06: starts a marker result from the left side", () => {
    const state = createMarkerMergeState(markedText);

    expect(state?.text).toBe("before\nleft one\nbetween\nleft two\nafter\n");
  });

  it("AC-R15-06: creates one conflict for each marker block", () => {
    const state = createMarkerMergeState(markedText);

    expect(state?.merge.chunks).toHaveLength(2);
    expect(state?.merge.resolved).toEqual([false, false]);
  });

  it("AC-R15-06: rejects text without conflict marker blocks", () => {
    expect(createMarkerMergeState("ordinary text\n")).toBeNull();
  });

  it("AC-R15-04: resolves different conflicts with right and both", () => {
    const initial = createMarkerMergeState(markedText);
    expect(initial).not.toBeNull();
    if (initial === null) return;

    const first = resolveMarkerConflict(initial, 0, "right");
    const second = resolveMarkerConflict(first, 1, "both");

    expect(second.text).toBe(
      "before\nright one\nbetween\nleft two\nright two\nafter\n",
    );
    expect(second.merge.resolved).toEqual([true, true]);
  });

  it("AC-R15-04: undo restores the text and unresolved counter", () => {
    const initial = createMarkerMergeState(markedText);
    expect(initial).not.toBeNull();
    if (initial === null) return;
    const resolved = resolveMarkerConflict(initial, 0, "left");

    const restored = undoMarkerConflict(resolved);

    expect(restored.text).toBe(initial.text);
    expect(restored.merge.resolved).toEqual([false, false]);
  });
});
