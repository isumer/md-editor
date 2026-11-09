import { describe, expect, it } from "vitest";

import { DocumentViews } from "../../src/renderer/tabs/documentViews";

describe("document views", () => {
  it("AC-R4-10: move removes a tab from its first view", () => {
    const views = new DocumentViews(["alpha", "beta"]);

    views.move("beta", 1);

    expect(views.documents(1)).toEqual(["alpha"]);
    expect(views.documents(2)).toEqual(["beta"]);
  });

  it("AC-R4-10: clone keeps a tab in both views", () => {
    const views = new DocumentViews(["alpha"]);

    views.clone("alpha", 1);

    expect(views.documents(1)).toEqual(["alpha"]);
    expect(views.documents(2)).toEqual(["alpha"]);
  });
});
