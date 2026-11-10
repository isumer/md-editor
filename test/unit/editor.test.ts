import { ensureSyntaxTree, language } from "@codemirror/language";
import { describe, expect, it, vi } from "vitest";

import { createDocumentState } from "../../src/renderer/core/document";
import {
  createEditorState,
  MARKDOWN_LANGUAGE_MAX_LENGTH,
} from "../../src/renderer/editor/editor";

function editorLanguage(document: string) {
  return editorState(document).facet(language)?.name ?? null;
}

function editorState(document: string) {
  return createEditorState(document, createDocumentState(), {
    onDocumentChanged: vi.fn(),
    onChanges: vi.fn(),
    updateTitle: vi.fn(),
  });
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

  it("AC-PERF-10: keeps Markdown behavior through four MiB", () => {
    expect(editorLanguage("x".repeat(4 * 1024 * 1024))).toBe("markdown");
  });

  it("AC-PERF-10: a huge plain line keeps its Markdown paragraph tree", () => {
    const document = "x".repeat(4 * 1024 * 1024);
    const tree = ensureSyntaxTree(editorState(document), document.length, 1_000);

    expect(tree?.toString()).toBe("Document(Paragraph)");
    expect(tree?.length).toBe(document.length);
    expect(tree?.topNode.firstChild?.to).toBe(document.length);
  });
});
