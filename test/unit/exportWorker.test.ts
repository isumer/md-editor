import { describe, expect, it, vi } from "vitest";

import { HtmlExportClient } from "../../src/renderer/features/export/client";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn();
}

describe("HTML export worker client", () => {
  it("AC-R6-05: sends HTML assembly to a worker", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const pending = client.build({
      title: "Document",
      blocks: [{ id: "one", html: "<h1>Heading</h1>" }],
      theme: "light",
      alwaysLight: false,
    });

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      input: {
        title: "Document",
        blocks: [{ id: "one", html: "<h1>Heading</h1>" }],
        theme: "light",
        alwaysLight: false,
      },
    });
    worker.onmessage?.(new MessageEvent("message", {
      data: { id: 1, ok: true, html: "<!doctype html>" },
    }));
    await expect(pending).resolves.toBe("<!doctype html>");
  });

  it("AC-R6-05: ignores stale replies and settles the matching request", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const pending = client.build({
      title: "Document",
      blocks: [],
      theme: "light",
      alwaysLight: false,
    });

    worker.onmessage?.(new MessageEvent("message", {
      data: { id: 99, ok: true, html: "stale" },
    }));
    worker.onmessage?.(new MessageEvent("message", {
      data: { id: 1, ok: true, html: "current" },
    }));

    await expect(pending).resolves.toBe("current");
  });
});
