import { EditorState, Text } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import {
  createDocumentRecord,
  createDocumentState,
  documentTitle,
  isDocumentDirty,
  markDocumentSaved,
  messageParams,
  setDocumentEol,
  settleDocumentReplacement,
} from "../../src/renderer/core/document";

describe("document dirty tracking", () => {
  function record(text: readonly string[], savedText = Text.of(text)) {
    const state = EditorState.create({ doc: Text.of(text) });
    return createDocumentRecord({
      replication: {
        current: () => ({ docId: "doc", epoch: 1, version: 0 }),
        changed: vi.fn(),
      },
      savedText,
      state,
    });
  }

  it("AC-R4-03: compares text with Text.eq and never flattens the document", () => {
    const document = record(["# Title", "", "Body"]);
    const toString = vi.spyOn(Text.prototype, "toString");
    try {
      expect(isDocumentDirty(document)).toBe(false);
      document.state = EditorState.create({ doc: Text.of(["# Title", "", "Body!"]) });
      expect(isDocumentDirty(document)).toBe(true);
      expect(toString).not.toHaveBeenCalled();
    } finally {
      toString.mockRestore();
    }
  });

  it("AC-R4-03: an EOL change is dirty until it is saved", () => {
    const document = record(["line"]);

    setDocumentEol(document, "crlf");

    expect(document.dirty).toBe(true);
    markDocumentSaved(document, document.state.doc, 1);
    expect(document.dirty).toBe(false);
    expect(document.saved.eol).toBe("crlf");
  });

  it("AC-R4-03: an edit during a save keeps the document dirty", () => {
    const document = record(["before"]);
    const savedSnapshot = document.state.doc;
    document.state = EditorState.create({ doc: Text.of(["before", "after"]) });

    markDocumentSaved(document, savedSnapshot, 1);

    expect(document.dirty).toBe(true);
  });
});

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

describe("document messages", () => {
  it("AC-R5-17: a restart failure names the file the renderer asked about", () => {
    expect(messageParams({}, "notes.md")).toEqual({ file: "notes.md" });
    expect(messageParams({}, null)).toEqual({ file: "Untitled" });
  });

  it("AC-R5-16: a file name from the service wins over the renderer's", () => {
    expect(messageParams({ file: "real.md" }, "shown.md")).toEqual({ file: "real.md" });
  });
});

describe("document replacement", () => {
  it("AC-SEC-09: declining an open releases the new grant", async () => {
    const release = vi.fn(async () => undefined);

    const accepted = await settleDocumentReplacement({
      currentGrant: "current",
      newGrant: "declined",
      dirty: true,
      confirmDiscard: () => false,
      release,
    });

    expect(accepted).toBe(false);
    expect(release).toHaveBeenCalledWith("declined");
  });

  it("AC-SEC-09: accepting an open releases the old grant", async () => {
    const release = vi.fn(async () => undefined);

    const accepted = await settleDocumentReplacement({
      currentGrant: "current",
      newGrant: "opened",
      dirty: false,
      confirmDiscard: () => { throw new Error("clean documents do not ask"); },
      release,
    });

    expect(accepted).toBe(true);
    expect(release).toHaveBeenCalledWith("current");
  });

  it("AC-SEC-09: replacing an untitled document releases nothing", async () => {
    const release = vi.fn(async () => undefined);

    const accepted = await settleDocumentReplacement({
      currentGrant: null,
      newGrant: "opened",
      dirty: false,
      confirmDiscard: () => false,
      release,
    });

    expect(accepted).toBe(true);
    expect(release).not.toHaveBeenCalled();
  });
});
