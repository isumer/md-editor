import { describe, expect, it } from "vitest";

import { renderMarkdown } from "../../src/renderer/render";

describe("renderMarkdown", () => {
  it("AC-R1-04: adds the zero-based source line to a heading", () => {
    expect(renderMarkdown("# Heading")).toContain('<h1 data-line="0">Heading</h1>');
  });

  it("AC-R1-03: highlights fenced code", () => {
    expect(renderMarkdown("```js\nconst answer = 42;\n```")).toContain("hljs");
  });

  it("AC-R1-03: escapes code when the fenced language is unknown", () => {
    const html = renderMarkdown("```unknown-language\n<tag>& value\n```");

    expect(html).toContain("&lt;tag&gt;&amp; value");
    expect(html).not.toContain("language-unknown-language");
  });

  it("AC-R1-03: renders checked task items as disabled checkboxes", () => {
    const html = renderMarkdown("- [x] done");

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("disabled");
  });

  it("AC-R1-03: renders unchecked and uppercase task markers", () => {
    const html = renderMarkdown("- [ ] pending\n- [X] complete");

    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked/g)).toHaveLength(1);
  });

  it("AC-R1-03: leaves ordinary list items unchanged", () => {
    expect(renderMarkdown("- ordinary item")).not.toContain("checkbox");
  });

  it("AC-SEC-04: preserves raw script HTML before sanitising", () => {
    expect(renderMarkdown("<script>alert('unsafe')</script>")).toContain("<script>");
  });
});
