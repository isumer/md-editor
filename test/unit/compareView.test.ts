// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createCompareState } from "../../src/renderer/features/compare/state";
import { CompareView } from "../../src/renderer/features/compare/view";

describe("compare view", () => {
  it("AC-R14-07: moving selection keeps rows outside both groups", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const view = new CompareView({
      close: vi.fn(),
      highlight: vi.fn(),
      move: vi.fn(),
    });
    const state = createCompareState(
      "one\nsame\ntwo\nsame again\nthree",
      "ONE\nsame\nTWO\nsame again\nTHREE",
      "words",
    );
    document.body.replaceChildren(view.root);
    view.show("left.txt", "right.txt", state);
    const stableRows = [...view.root.querySelectorAll<HTMLElement>(".compare-row")]
      .filter((row) => row.dataset.changeIndex !== "0" && row.dataset.changeIndex !== "1");

    view.moveSelection(0, 1);

    const currentRows = [...view.root.querySelectorAll<HTMLElement>(".compare-row")];
    expect(stableRows.length).toBeGreaterThan(0);
    expect(stableRows.every((row) => currentRows.includes(row))).toBe(true);
    expect(view.root.querySelector('[data-change-index="0"]')?.classList
      .contains("compare-selected")).toBe(false);
    expect(view.root.querySelector('[data-change-index="1"]')?.classList
      .contains("compare-selected")).toBe(true);
  });
});
