import { language } from "@codemirror/language";
import { describe, expect, it, vi } from "vitest";

import { createDocumentState } from "../../src/renderer/core/document";
import {
  createEditorState,
  MARKDOWN_LANGUAGE_MAX_LENGTH,
} from "../../src/renderer/editor/editor";

function editorLanguage(document: string) {
  return createEditorState(document, createDocumentState(), {
    onDocumentChanged: vi.fn(),
    onChanges: vi.fn(),
    updateTitle: vi.fn(),
  }).facet(language)?.name ?? null;
}

// Short paragraphs of exactly `length` characters. One giant paragraph would
// make the parser inline-parse megabytes in a single step, which takes
// seconds under coverage and says nothing about the size threshold.
function markdownOfLength(length: number): string {
  const paragraph = `${"x".repeat(78)}\n\n`;
  return paragraph.repeat(Math.floor(length / paragraph.length)).padEnd(length, "x");
}

describe("editor language size threshold", () => {
  it("AC-PERF-10: a small document has the Markdown language", () => {
    expect(editorLanguage("# Small document")).toBe("markdown");
  });

  it("AC-PERF-10: a document above the threshold has no language", () => {
    expect(editorLanguage(markdownOfLength(MARKDOWN_LANGUAGE_MAX_LENGTH + 1))).toBeNull();
  });

  it("AC-PERF-10: a document at the threshold has the Markdown language", () => {
    expect(editorLanguage(markdownOfLength(MARKDOWN_LANGUAGE_MAX_LENGTH))).toBe("markdown");
  });

  it("AC-PERF-10: keeps Markdown behavior through four MiB", () => {
    expect(editorLanguage(markdownOfLength(4 * 1024 * 1024))).toBe("markdown");
  });
});
