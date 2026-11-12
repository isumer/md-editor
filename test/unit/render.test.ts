import hljs from "highlight.js/lib/common";
import { describe, expect, it, vi } from "vitest";

import { renderMarkdown } from "../../src/renderer/workers/render/render";

describe("renderMarkdown", () => {
  it("AC-R1-04: adds the zero-based source line to a heading", () => {
    expect(renderMarkdown("# Heading")).toContain('<h1 data-line="0">Heading</h1>');
  });

  it("AC-R1-03: highlights fenced code", () => {
    expect(renderMarkdown("```js\nconst answer = 42;\n```")).toContain("hljs");
  });

  it("AC-PERF-11: reuses highlighting for repeated code", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    const markdown = "```js\nconst cacheProbe = 'repeated';\n```";

    renderMarkdown(markdown);
    renderMarkdown(markdown);

    expect(highlight).toHaveBeenCalledTimes(1);
  });

  it("AC-PERF-11: evicts the oldest highlight after 64 entries", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    const oldestSource = "const cacheProbeOldest = 0;\n";

    renderMarkdown(`\`\`\`js\n${oldestSource}\`\`\``);
    for (let index = 1; index <= 64; index += 1) {
      renderMarkdown(`\`\`\`js\nconst cacheProbeEntry = ${String(index)};\n\`\`\``);
    }
    renderMarkdown(`\`\`\`js\n${oldestSource}\`\`\``);

    expect(
      highlight.mock.calls.filter(([source]) => source === oldestSource),
    ).toHaveLength(2);
  });

  it("AC-PERF-11: does not retain code blocks larger than 64 KiB", () => {
    const highlight = vi.spyOn(hljs, "highlight");
    const source = `${"x".repeat(64 * 1024)}\n`;
    const markdown = `\`\`\`plaintext\n${source}\`\`\``;

    renderMarkdown(markdown);
    renderMarkdown(markdown);

    expect(
      highlight.mock.calls.filter(([highlighted]) => highlighted === source),
    ).toHaveLength(2);
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
