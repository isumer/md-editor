import { describe, expect, it } from "vitest";

import { createDocumentState, documentTitle } from "../../src/renderer/core/document";

describe("document title", () => {
  it("AC-R5-02: names an untitled clean document without a marker", () => {
    const state = { ...createDocumentState(), productName: "MD Editor" };

    expect(documentTitle(state)).toBe("Untitled — MD Editor");
  });

  it("AC-R5-02: shows the display name without exposing a file path", () => {
    const state = {
      ...createDocumentState(),
      currentGrant: "opaque-grant",
      currentName: "today.md",
      productName: "MD Editor",
    };

    expect(documentTitle(state)).toBe("today.md — MD Editor");
  });

  it("AC-R5-02: prefixes the dirty marker only while there are unsaved changes", () => {
    const dirty = {
      ...createDocumentState(),
      currentName: "a.md",
      dirty: true,
      productName: "MD Editor",
    };

    expect(documentTitle(dirty)).toBe("• a.md — MD Editor");
    expect(documentTitle({ ...dirty, dirty: false })).toBe("a.md — MD Editor");
  });

  it("AC-R5-02: omits the product suffix before the product name is known", () => {
    const state = { ...createDocumentState(), currentName: "a.md" };

    expect(documentTitle(state)).toBe("a.md");
  });

  it("AC-R5-02: keeps an untitled name until a display name is adopted", () => {
    const state = { ...createDocumentState(), currentGrant: "opaque-grant" };

    expect(documentTitle(state)).toBe("Untitled");
  });
});
