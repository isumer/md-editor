import { ensureSyntaxTree, language } from "@codemirror/language";
import { describe, expect, it, vi } from "vitest";

import { createDocumentState } from "../../src/renderer/core/document";
import {
  createEditorState,
  MARKDOWN_LANGUAGE_MAX_LENGTH,
} from "../../src/renderer/editor/editor";

function editorState(document: string) {
  return createEditorState(document, createDocumentState(), {
    onDocumentChanged: vi.fn(),
    onChanges: vi.fn(),
    updateTitle: vi.fn(),
  });
}

function editorLanguage(document: string) {
  return editorState(document).facet(language)?.name ?? null;
}

describe("editor language size threshold", () => {
  it("AC-PERF-10: a small document has the Markdown language", () => {
    expect(editorLanguage("# Small document")).toBe("markdown");
  });

  it("AC-PERF-10: a document above the threshold has no language", () => {
    expect(editorLanguage("x".repeat(MARKDOWN_LANGUAGE_MAX_LENGTH + 1))).toBeNull();
  });

  it("AC-PERF-10: a document at the threshold has the Markdown language", () => {
    expect(editorLanguage("x".repeat(MARKDOWN_LANGUAGE_MAX_LENGTH))).toBe("markdown");
  });

  it("AC-PERF-10: a long line keeps Markdown tokens around plain text", () => {
    const document = "& invalid *emphasis* " + "x".repeat(64 * 1024);
    const state = editorState(document);

    const tree = ensureSyntaxTree(state, document.length, 1_000);

    expect(tree?.toString()).toContain("Emphasis");
  });
});
