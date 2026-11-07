// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  blockLine,
  PreviewDocuments,
  recordShiftTable,
} from "../../src/renderer/features/preview/previewDocuments";

describe("preview documents", () => {
  it("AC-R4-01: dropping a rendered document removes its cached preview", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const documents = new PreviewDocuments(host);
    const preview = documents.getOrCreate("doc", 1);
    preview.version = 1;
    preview.container.dataset["renderComplete"] = "true";
    preview.container.append(document.createElement("p"));
    documents.display(preview);

    documents.drop("doc");

    expect(documents.show({ docId: "doc", epoch: 1, version: 1 })).toBe(false);
    expect(host.childElementCount).toBe(0);
  });

  it("AC-PERF-09: an already shown document is not re-inserted", async () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const documents = new PreviewDocuments(host);
    const preview = documents.getOrCreate("doc", 1);
    documents.display(preview);

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(host, { childList: true });
    documents.display(preview);
    await Promise.resolve();
    observer.disconnect();

    expect(records).toEqual([]);
    expect(host.firstChild).toBe(preview.container);
  });

  it("AC-R4-01: showing another document replaces the shown preview", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const documents = new PreviewDocuments(host);
    const first = documents.getOrCreate("first", 1);
    const second = documents.getOrCreate("second", 1);
    second.container.dataset["renderComplete"] = "true";
    documents.display(first);

    documents.display(second);

    expect([...host.childNodes]).toEqual([second.container]);
    expect(host.dataset["renderComplete"]).toBe("true");
  });

  it("AC-R1-04: missing metadata starts at zero and leading shifts move a block", () => {
    const root = document.createElement("div");
    const block = document.createElement("div");
    root.append(block);
    expect(blockLine(block)).toBe(0);
    recordShiftTable(block, root, [{ after: null, delta: 2, version: 1 }]);

    expect(blockLine(block)).toBe(2);
  });

  it("AC-R4-01: epochs replace stale caches and reset clears the shown document", () => {
    const host = document.createElement("div");
    const documents = new PreviewDocuments(host);
    const first = documents.getOrCreate("doc", 1);
    expect(documents.getOrCreate("doc", 1)).toBe(first);
    const second = documents.getOrCreate("doc", 2);
    expect(second).not.toBe(first);
    documents.display(second);
    expect(host.dataset["renderComplete"]).toBe("false");
    documents.drop("doc");
    const detached = documents.getOrCreate("detached", 1);
    documents.drop("detached");
    expect(detached.container.isConnected).toBe(false);

    documents.reset();

    expect(host.childElementCount).toBe(0);
  });
});
