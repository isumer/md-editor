import { describe, expect, it } from "vitest";

import { createDocumentState, documentTitle } from "../../src/renderer/core/document";

describe("document title", () => {
  it("AC-R5-02: names an untitled clean document without a marker", () => {
    const state = { ...createDocumentState(), productName: "MD Editor" };

    expect(documentTitle(state)).toBe("Untitled — MD Editor");
  });

  it("AC-R5-02: shows the file name, not the folder, for POSIX and Windows paths", () => {
    const posix = { ...createDocumentState(), currentPath: "/home/u/notes/today.md", productName: "MD Editor" };
    const windows = { ...posix, currentPath: "C:\\Users\\u\\notes\\today.md" };

    expect(documentTitle(posix)).toBe("today.md — MD Editor");
    expect(documentTitle(windows)).toBe("today.md — MD Editor");
  });

  it("AC-R5-02: prefixes the dirty marker only while there are unsaved changes", () => {
    const dirty = { ...createDocumentState(), currentPath: "/tmp/a.md", dirty: true, productName: "MD Editor" };

    expect(documentTitle(dirty)).toBe("• a.md — MD Editor");
    expect(documentTitle({ ...dirty, dirty: false })).toBe("a.md — MD Editor");
  });

  it("AC-R5-02: omits the product suffix before the product name is known", () => {
    const state = { ...createDocumentState(), currentPath: "/tmp/a.md" };

    expect(documentTitle(state)).toBe("a.md");
  });

  it("AC-R5-02: falls back to the whole path when it ends in a separator", () => {
    const state = { ...createDocumentState(), currentPath: "/tmp/dir/" };

    expect(documentTitle(state)).toBe("/tmp/dir/");
  });
});
