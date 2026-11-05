import { describe, expect, it } from "vitest";

import {
  rewriteAssets,
  rewriteAssetUrls,
} from "../../src/renderer/features/preview/rewriteAssets";

const context = { windowId: 7, grant: "Grant-Handle_1" };
const prefix = "doc-asset://7/Grant-Handle_1/";

describe("document asset rewriting", () => {
  it.each([
    {
      name: "a relative path",
      html: '<p><img src="images/pic.png" alt="Pic"></p>',
      expected: `<p><img src="${prefix}images/pic.png" alt="Pic"></p>`,
    },
    {
      name: "an explicit relative path",
      html: `<img src="./pic.png">`,
      expected: `<img src="${prefix}./pic.png">`,
    },
    {
      name: "a parent path",
      html: `<img src="../pic.png">`,
      expected: `<img src="${prefix}../pic.png">`,
    },
    {
      name: "a query and fragment",
      html: `<img src="pic.png?v=1#top">`,
      expected: `<img src="${prefix}pic.png?v=1#top">`,
    },
    {
      name: "an https URL",
      html: '<img src="https://example.com/pic.png">',
      expected: '<img src="https://example.com/pic.png">',
    },
    {
      name: "an http URL",
      html: '<img src="http://example.com/pic.png">',
      expected: '<img src="http://example.com/pic.png">',
    },
    {
      name: "a data URL",
      html: '<img src="data:image/png;base64,AAAA">',
      expected: '<img src="data:image/png;base64,AAAA">',
    },
    {
      name: "an absolute path",
      html: '<img src="/images/pic.png">',
      expected: '<img src="/images/pic.png">',
    },
    {
      name: "a network path",
      html: '<img src="//example.com/pic.png">',
      expected: '<img src="//example.com/pic.png">',
    },
    {
      name: "a file URL",
      html: '<img src="file:///etc/hostname">',
      expected: '<img src="file:///etc/hostname">',
    },
    {
      name: "a fragment only URL",
      html: '<img src="#top">',
      expected: '<img src="#top">',
    },
    {
      name: "an empty URL",
      html: '<img src="">',
      expected: '<img src="">',
    },
    {
      name: "a single-quoted attribute",
      html: "<img src='pic.png'>",
      expected: `<img src='${prefix}pic.png'>`,
    },
    {
      name: "an unquoted attribute",
      html: "<img src=pic.png>",
      expected: `<img src=${prefix}pic.png>`,
    },
    {
      name: "a non-image tag",
      html: '<a href="pic.png">Pic</a><video src="pic.png"></video>',
      expected: '<a href="pic.png">Pic</a><video src="pic.png"></video>',
    },
    {
      name: "a tag without a closing bracket",
      html: '<img src="pic.png"',
      expected: '<img src="pic.png"',
    },
    {
      name: "an image element name prefix",
      html: '<image src="pic.png">',
      expected: '<image src="pic.png">',
    },
    {
      name: "an attribute whose name ends in src",
      html: '<img data-src="pic.png" src="pic.png">',
      expected: `<img data-src="pic.png" src="${prefix}pic.png">`,
    },
  ])("AC-SEC-16: rewrites $name", ({ html, expected }) => {
    expect(rewriteAssetUrls(html, context)).toBe(expected);
    expect(rewriteAssets(html, context)).toBe(expected);
  });

  it("AC-SEC-16: rewrites a mixed srcset and leaves absolute candidates alone", () => {
    const html = '<img srcset="one.png 1x, https://example.com/two.png 2x, ' +
      "data:image/png;base64,AAAA 3x, four.png 4x" + '">';

    expect(rewriteAssetUrls(html, context)).toBe(
      `<img srcset="${prefix}one.png 1x, https://example.com/two.png 2x, ` +
      `data:image/png;base64,AAAA 3x, ${prefix}four.png 4x">`,
    );
  });

  it("AC-SEC-16: leaves a srcset with no relative candidate byte-identical", () => {
    const html = '<img srcset="  https://example.com/a.png 1x ,  data:,b 2x ">';

    expect(rewriteAssetUrls(html, context)).toBe(html);
  });

  it("AC-SEC-16: handles comma-separated srcset candidates with no descriptors", () => {
    const html = '<img srcset="one.png, two.png 2x">';

    expect(rewriteAssetUrls(html, context)).toBe(
      `<img srcset="${prefix}one.png, ${prefix}two.png 2x">`,
    );
  });

  it("AC-SEC-16: leaves HTML without an image untouched", () => {
    const html = "<h1>Title</h1><p>No images</p>";

    expect(rewriteAssetUrls(html, context)).toBe(html);
  });

  it("AC-SEC-16: renders relative images unchanged when there is no grant", () => {
    const html = '<img src="images/pic.png" srcset="images/pic.png 2x">';

    expect(rewriteAssetUrls(html, { windowId: 7, grant: null })).toBe(html);
    expect(rewriteAssetUrls(html, { windowId: null, grant: "grant" })).toBe(html);
    expect(rewriteAssetUrls(html, { windowId: 7, grant: "" })).toBe(html);
  });
});
