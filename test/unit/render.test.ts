import { describe, expect, it } from "vitest";

import { renderMarkdown } from "../../src/renderer/render";

describe("renderMarkdown", () => {
  it("adds the zero-based source line to a heading", () => {
    expect(renderMarkdown("# Heading")).toContain('<h1 data-line="0">Heading</h1>');
  });

  it("highlights fenced code", () => {
    expect(renderMarkdown("```js\nconst answer = 42;\n```")).toContain("hljs");
  });

  it("renders checked task items as disabled checkboxes", () => {
    const html = renderMarkdown("- [x] done");

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("disabled");
  });

  it("preserves raw script HTML before sanitising", () => {
    expect(renderMarkdown("<script>alert('unsafe')</script>")).toContain("<script>");
  });
});
