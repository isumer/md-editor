// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { PreviewExportCache } from "../../src/renderer/features/export/cache";

function block(id: string, html: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "preview-block";
  element.dataset["blockId"] = id;
  element.innerHTML = html;
  return element;
}

function publish(element: HTMLElement, html: string): void {
  document.dispatchEvent(new CustomEvent("solidmd:preview-block-html", {
    detail: { element, html },
  }));
}

describe("preview export cache", () => {
  it("AC-R6-01 AC-R6-05: updates snapshots without serialising preview mutations", async () => {
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
    Object.defineProperty(first, "innerHTML", {
      configurable: true,
      get: () => { throw new Error("The cache serialised a preview mutation"); },
    });
    publish(first, "<h1>Updated</h1>");
    const inserted = block("inserted", "<p>Inserted</p>");
    publish(inserted, "<p>Inserted</p>");
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

  it("AC-R6-01: rewrites asset URLs only inside image tags", () => {
    const preview = document.createElement("div");
    const rendered = block(
      "one",
      '<p>doc-asset://4/grant/assets/text.png</p>' +
      '<img src="doc-asset://4/grant/assets/image.png">',
    );
    preview.append(rendered);

    const cache = new PreviewExportCache(preview);

    expect(cache.snapshot()).toEqual([{
      id: "one",
      html: '<p>doc-asset://4/grant/assets/text.png</p><img src="assets/image.png">',
    }]);
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

  it("AC-R6-01: ignores added blocks without preview-produced HTML", async () => {
    const preview = document.createElement("div");
    const cache = new PreviewExportCache(preview);

    preview.append(block("unreported", "<p>User-injected block</p>"));
    await Promise.resolve();

    expect(cache.snapshot()).toEqual([]);
  });

  it("AC-R6-05: records cache work before a new preview block is attached", () => {
    const preview = document.createElement("div");
    new PreviewExportCache(preview);
    const measure = vi.spyOn(performance, "measure");

    publish(block("detached", "<p>Detached</p>"), "<p>Detached</p>");

    expect(measure).toHaveBeenCalledWith("preview-export-cache", expect.any(Object));
    measure.mockRestore();
  });

  it("AC-R6-01: inserts a new cached block in preview order", async () => {
    const preview = document.createElement("div");
    const first = block("first", "<p>First</p>");
    const third = block("third", "<p>Third</p>");
    preview.append(first, third);
    const cache = new PreviewExportCache(preview);
    const second = block("second", "<p>Second</p>");

    publish(second, "<p>Second</p>");
    preview.insertBefore(second, third);
    await Promise.resolve();

    expect(cache.snapshot()).toEqual([
      { id: "first", html: "<p>First</p>" },
      { id: "second", html: "<p>Second</p>" },
      { id: "third", html: "<p>Third</p>" },
    ]);
  });
});
