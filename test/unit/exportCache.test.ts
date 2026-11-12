// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { PreviewExportCache } from "../../src/renderer/features/export/cache";

function block(id: string, html: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "preview-block";
  element.dataset["blockId"] = id;
  element.innerHTML = html;
  return element;
}

describe("preview export cache", () => {
  it("AC-R6-01 AC-R6-05: snapshots sanitised blocks without reading the live DOM", async () => {
    const preview = document.createElement("div");
    const firstPage = document.createElement("div");
    const secondPage = document.createElement("div");
    const first = block("first", '<h1>First</h1><img src="doc-asset://4/grant/assets/a.png">');
    const second = block("second", "<p>Second</p>");
    firstPage.append(first);
    secondPage.append(second);
    preview.append(firstPage, secondPage);
    const cache = new PreviewExportCache(preview);

    first.innerHTML = "<h1>Updated</h1>";
    const inserted = block("inserted", "<p>Inserted</p>");
    const emptySibling = document.createElement("div");
    emptySibling.append(document.createElement("span"));
    secondPage.prepend(emptySibling, inserted);
    second.innerHTML = "<p>Removed</p>";
    second.remove();
    preview.append("ignored text");
    await Promise.resolve();

    expect(cache.snapshot()).toEqual([
      { id: "first", html: "<h1>Updated</h1>" },
      { id: "inserted", html: "<p>Inserted</p>" },
    ]);
  });

  it("AC-R6-01: ignores nested user data that resembles a preview block", () => {
    const preview = document.createElement("div");
    preview.append(block(
      "outer",
      '<div class="preview-block" data-block-id="user-content">Text</div>',
    ));

    const cache = new PreviewExportCache(preview);

    expect(cache.snapshot()).toEqual([{
      id: "outer",
      html: '<div class="preview-block" data-block-id="user-content">Text</div>',
    }]);
  });
});
