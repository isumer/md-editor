import { EditorSelection } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { DocumentViews } from "../../src/renderer/tabs/documentViews";

describe("document views", () => {
  it("AC-R4-10: move transfers a tab in either direction", () => {
    const views = new DocumentViews(["alpha", "beta"]);

    views.move("beta", 1);

    expect(views.documents(1)).toEqual(["alpha"]);
    expect(views.documents(2)).toEqual(["beta"]);

    views.move("beta", 2);

    expect(views.documents(1)).toEqual(["alpha", "beta"]);
    expect(views.documents(2)).toEqual([]);
  });

  it("AC-R4-10: clone keeps a tab in both views", () => {
    const views = new DocumentViews(["alpha"]);

    views.clone("alpha", 1);

    expect(views.documents(1)).toEqual(["alpha"]);
    expect(views.documents(2)).toEqual(["alpha"]);
  });

  it("AC-R4-11: cloned tabs store only independent selection and scroll state", () => {
    const views = new DocumentViews(["alpha"]);
    const first = { scrollTop: 20, selection: EditorSelection.single(2) };
    const second = { scrollTop: 80, selection: EditorSelection.single(8) };

    views.saveState("alpha", 1, first);
    views.saveState("alpha", 2, second);

    expect(views.state("alpha", 1)).toEqual(first);
    expect(views.state("alpha", 2)).toEqual(second);
    expect(Object.keys(views.state("alpha", 2) ?? {})).toEqual([
      "scrollTop",
      "selection",
    ]);
  });

  it("AC-R4-10: adding is idempotent and removing clears both views and states", () => {
    const views = new DocumentViews();
    const state = { scrollTop: 20, selection: EditorSelection.single(2) };
    views.add("alpha");
    views.add("alpha");
    views.clone("alpha", 1);
    views.saveState("alpha", 1, state);
    views.saveState("alpha", 2, state);

    views.remove("alpha");

    expect(views.documents(1)).toEqual([]);
    expect(views.documents(2)).toEqual([]);
    expect(views.state("alpha", 1)).toBeUndefined();
    expect(views.state("alpha", 2)).toBeUndefined();
  });
});
