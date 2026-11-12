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

  it("shows empty sides and dispatches both navigation buttons", () => {
    const move = vi.fn();
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move });
    const state = createCompareState(
      "same\ndeleted\nend",
      "same\nend\nadded",
      "words",
    );
    view.show("left.txt", "right.txt", state);
    const buttons = view.root.querySelectorAll<HTMLButtonElement>(".compare-button");

    buttons[0]?.click();
    buttons[1]?.click();

    expect(view.root.querySelectorAll(".compare-empty").length).toBeGreaterThan(0);
    expect(move.mock.calls).toEqual([[-1], [1]]);
  });

  it("shows the highlight mode of each compare result", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const select = view.root.querySelector<HTMLSelectElement>(".compare-highlight");
    if (!select) throw new Error("Missing compare highlight selector.");
    select.value = "characters";

    view.show("left.txt", "right.txt", createCompareState("left", "right", "words"));

    expect(select.value).toBe("words");
  });

  it("keeps rendering when the highlight select is absent", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const select = view.root.querySelector(".compare-highlight");
    if (!select) throw new Error("Missing compare highlight selector.");
    select.remove();

    view.show("left.txt", "right.txt", createCompareState("left", "right", "words"));

    expect(view.root.hidden).toBe(false);
    expect(view.root.querySelectorAll(".compare-row").length).toBe(1);
  });

  it("AC-R14-03: unified mode keeps every change in one column", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const state = createCompareState("same\nold\ndeleted", "same\nnew", "words");
    view.show("left.txt", "right.txt", state);
    const changeCount = view.root.querySelectorAll(".compare-overview-marker").length;

    view.root.querySelector<HTMLButtonElement>(".compare-mode")?.click();

    expect(view.root.classList.contains("compare-unified")).toBe(true);
    expect(view.root.querySelectorAll(".compare-heading")).toHaveLength(1);
    expect(view.root.querySelectorAll(".compare-overview-marker")).toHaveLength(changeCount);
    expect(view.root.querySelector('[data-change-index="0"]')?.children).toHaveLength(2);
    expect(view.root.textContent).toContain("deleted");

    view.root.querySelector<HTMLButtonElement>(".compare-mode")?.click();
    expect(view.root.classList.contains("compare-unified")).toBe(false);
  });

  it("ignores a mode request before a compare and tolerates a removed control", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const mode = view.root.querySelector<HTMLButtonElement>(".compare-mode");
    expect(mode).not.toBeNull();
    mode?.click();
    expect(view.root.classList.contains("compare-unified")).toBe(false);
    view.show("left.txt", "right.txt", createCompareState("left", "right", "words"));
    mode?.remove();

    mode?.click();

    expect(view.root.classList.contains("compare-unified")).toBe(true);
  });

  it("AC-R14-09: collapses long unchanged regions and expands them aligned", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const left = Array.from({ length: 1_000 }, (_, index) => `line ${String(index + 1)}`);
    const right = [...left];
    right[499] = "changed";
    view.show("left.txt", "right.txt", createCompareState(
      left.join("\n"),
      right.join("\n"),
      "words",
    ));

    const expand = view.root.querySelector<HTMLButtonElement>(".compare-expand");
    expect(expand).not.toBeNull();
    expect(view.root.querySelectorAll(".compare-row").length).toBeLessThan(20);
    expand?.click();

    expect(view.root.querySelectorAll(".compare-expand")).toHaveLength(1);
    expect(view.root.querySelectorAll(".compare-row").length).toBeGreaterThan(500);
    expect(view.root.querySelectorAll(".compare-row .compare-cell").length % 2).toBe(0);
  });

  it("AC-R14-11: shows a fallback notice for a limited diff", () => {
    const view = new CompareView({ close: vi.fn(), highlight: vi.fn(), move: vi.fn() });
    const left = Array.from({ length: 200 }, (_, index) => `left${String(index)}`).join(" ");
    const right = Array.from({ length: 200 }, (_, index) => `right${String(index)}`).join(" ");

    view.show("left.txt", "right.txt", createCompareState(left, right, "words"));

    expect(view.root.querySelector("[role=status]")?.textContent)
      .toBe("The detailed diff took too long. SolidMD shows line changes instead.");
  });
});
