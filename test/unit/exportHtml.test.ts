import { describe, expect, it } from "vitest";

import {
  buildExportHtml,
  type HtmlExportInput,
} from "../../src/renderer/features/export/html";

function input(overrides: Partial<HtmlExportInput> = {}): HtmlExportInput {
  return {
    title: "Preview <draft>",
    blocks: [
      { id: "one", html: '<h1 data-line="0">Heading</h1>' },
      {
        id: "two",
        html: '<pre><code class="hljs"><span class="hljs-keyword">const</span></code></pre>',
      },
      { id: "three", html: '<p><img src="images/picture.png"></p>' },
    ],
    theme: "dark",
    alwaysLight: false,
    ...overrides,
  };
}

describe("HTML export", () => {
  it("AC-R6-01: builds one document from rendered blocks with inline styles", () => {
    const html = buildExportHtml(input());

    expect(html).toContain("<h1 data-line=\"0\">Heading</h1>");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain('<img src="images/picture.png">');
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/<link\b[^>]*stylesheet/i);
    expect(html).not.toContain("<draft>");
  });

  it("AC-R6-04: leaves page margins to the PDF options", () => {
    const html = buildExportHtml(input());

    expect(html).not.toMatch(/@page\b/);
  });

  it("AC-R6-02: uses the active dark preview theme", () => {
    const html = buildExportHtml(input());

    expect(html).toContain("color-scheme: dark");
    expect(html).toContain("background: #0d1117");
  });

  it("AC-R6-02: uses the light preview theme when always light is on", () => {
    const html = buildExportHtml(input({ alwaysLight: true }));

    expect(html).toContain("color-scheme: light");
    expect(html).toContain("background: #ffffff");
    expect(html).not.toContain("background: #0d1117");
  });

  it("AC-R6-02: resolves the system theme before export", () => {
    const html = buildExportHtml(input({ theme: "system", systemTheme: "dark" }));

    expect(html).toContain("color-scheme: dark");
  });

  it("AC-R6-02: falls back to light when the system theme is unknown", () => {
    const html = buildExportHtml(input({ theme: "system", systemTheme: undefined }));

    expect(html).toContain("color-scheme: light");
    expect(html).not.toContain("color-scheme: dark");
  });
});
