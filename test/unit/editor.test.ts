import { markdown } from "@codemirror/lang-markdown";
import { language } from "@codemirror/language";
import { describe, expect, it, vi } from "vitest";

import { createDocumentState } from "../../src/renderer/core/document";
import {
  createEditorState,
  MARKDOWN_LANGUAGE_MAX_LENGTH,
} from "../../src/renderer/editor/editor";

function editorStateFor(document: string) {
  return createEditorState(document, createDocumentState(), {
    onDocumentChanged: vi.fn(),
    onChanges: vi.fn(),
  });
}

function editorLanguage(document: string) {
  return editorStateFor(document).facet(language)?.name ?? null;
}

interface OutlineNode {
  name: string;
  from: number;
  to: number;
  firstChild: OutlineNode | null;
  nextSibling: OutlineNode | null;
}

function outline(node: OutlineNode): string {
  const children: string[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(outline(child));
  }
  return children.length === 0
    ? `${node.name}[${node.from}..${node.to}]`
    : `${node.name}[${node.from}..${node.to}](${children.join(",")})`;
}

function parsedOutline(document: string): [string, string] {
  const parser = editorStateFor(document).facet(language)?.parser;
  if (!parser) {
    throw new Error("editor state has no language parser");
  }
  return [
    outline(parser.parse(document).topNode),
    outline(markdown().language.parser.parse(document).topNode),
  ];
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

describe("plain document fast path", () => {
  it("AC-PERF-10: a long unbroken plain line parses to the real tree", () => {
    const [fast, real] = parsedOutline("x".repeat(100 * 1024));
    expect(fast).toBe(real);
  });

  it("AC-PERF-10: a large heading line keeps its heading structure", () => {
    const [fast, real] = parsedOutline(`# ${"x".repeat(100 * 1024)}`);
    expect(fast).toBe(real);
    expect(fast).toContain("ATXHeading1");
  });

  it("AC-PERF-10: a multi-paragraph plain document keeps its paragraphs", () => {
    const document = `${"x".repeat(100 * 1024)}\n\n${"y".repeat(64)}`;
    const [fast, real] = parsedOutline(document);
    expect(fast).toBe(real);
    expect(fast.match(/Paragraph/g)).toHaveLength(2);
  });
});
