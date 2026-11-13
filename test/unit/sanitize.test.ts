// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { sanitizeRenderedHtml } from "../../src/renderer/features/preview/sanitize";

describe("sanitizeRenderedHtml", () => {
  it("AC-PERF-08: keeps a generated plain-text block byte-identical", () => {
    const html = '<h1 data-line="12">Safe &amp; fast</h1>\n';

    expect(sanitizeRenderedHtml(html)).toBe(html);
  });

  it("AC-SEC-04: removes active document elements and event handlers", () => {
    const result = sanitizeRenderedHtml(`
      <script>bad()</script>
      <style>body { display: none; }</style>
      <link rel="stylesheet" href="bad.css">
      <meta http-equiv="refresh" content="0;url=https://example.com">
      <base href="https://example.com/">
      <form action="https://example.com/"><button onclick="bad()">Submit</button></form>
      <img src="safe.png" onerror="bad()">
    `);

    expect(result).not.toMatch(/<(?:script|style|link|meta|base|form)\b/i);
    expect(result).not.toMatch(/\son\w+=/i);
    expect(result).toContain("<button>Submit</button>");
    expect(result).toContain('<img src="safe.png">');
  });

  it("AC-SEC-04: removes script URLs and keeps preview metadata and inline styles", () => {
    const result = sanitizeRenderedHtml(
      '<h1 data-line="0" style="color: red">Safe</h1><a href="javascript:bad()">Link</a>',
    );

    expect(result).toContain('<h1 data-line="0" style="color: red">Safe</h1>');
    expect(result).toContain("<a>Link</a>");
    expect(result).not.toContain("javascript:");
  });

  it("AC-SEC-05: removes ids that can clobber DOM properties", () => {
    const result = sanitizeRenderedHtml('<p id="location">Safe</p>');

    expect(result).toBe("<p>Safe</p>");
  });

  it("AC-SEC-16: allows doc-asset URLs only on image sources", () => {
    const result = sanitizeRenderedHtml(
      '<img src="doc-asset://1/grant/pic.png" ' +
        'srcset="doc-asset://1/grant/pic.png 2x">' +
        '<a href="doc-asset://1/grant/secret.md">Link</a>' +
        '<video src="doc-asset://1/grant/clip.mp4"></video>',
    );

    expect(result).toContain('<img src="doc-asset://1/grant/pic.png"');
    expect(result).toContain("srcset=\"doc-asset://1/grant/pic.png 2x\"");
    expect(result).toContain("<a>Link</a>");
    expect(result).toContain("<video></video>");
  });

  it("AC-SEC-16: keeps relative image sources for the rewrite step", () => {
    const result = sanitizeRenderedHtml('<img src="images/pic.png">');

    expect(result).toBe('<img src="images/pic.png">');
  });
});
