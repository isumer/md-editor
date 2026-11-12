import { describe, expect, it, vi } from "vitest";

import { HtmlExportClient } from "../../src/renderer/features/export/client";

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn();
}

describe("HTML export worker client", () => {
  it("AC-R6-05: sends a 500 KB export to the worker without local assembly", () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const html = "x".repeat(500 * 1024);

    void client.build({
      title: "Large document",
      blocks: [{ id: "large", html }],
      theme: "light",
      alwaysLight: false,
    });

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      input: {
        title: "Large document",
        blocks: [{ id: "large", html }],
        theme: "light",
        alwaysLight: false,
      },
    });
  });

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

  it("AC-R6-05: rejects every pending build when the worker fails", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const first = client.build({ title: "One", blocks: [], theme: "light", alwaysLight: false });
    const second = client.build({ title: "Two", blocks: [], theme: "light", alwaysLight: false });

    worker.onerror?.({ message: "worker crashed" } as ErrorEvent);

    await expect(first).rejects.toThrow("worker crashed");
    await expect(second).rejects.toThrow("worker crashed");
  });

  it("AC-R6-05: names a worker failure that carries no message", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const pending = client.build({ title: "One", blocks: [], theme: "light", alwaysLight: false });

    worker.onerror?.({ message: "" } as ErrorEvent);

    await expect(pending).rejects.toThrow("HTML export worker failed");
  });

  it("AC-R6-05: rejects a build with the worker failure message", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const pending = client.build({ title: "One", blocks: [], theme: "light", alwaysLight: false });

    worker.onmessage?.(new MessageEvent("message", {
      data: { id: 1, ok: false, message: "render failed" },
    }));

    await expect(pending).rejects.toThrow("render failed");
  });

  it("AC-R6-05: ignores malformed replies and unknown ids", async () => {
    const worker = new FakeWorker();
    const client = new HtmlExportClient(worker);
    const pending = client.build({ title: "One", blocks: [], theme: "light", alwaysLight: false });

    for (const data of [
      null,
      { id: "1", ok: true, html: "bad id" },
      { id: 1, ok: "yes", html: "bad flag" },
      { id: 1, ok: true, html: 5 },
      { id: 1, ok: false, message: 5 },
      { id: 2, ok: true, html: "unknown" },
    ]) {
      worker.onmessage?.(new MessageEvent("message", { data }));
    }
    worker.onmessage?.(new MessageEvent("message", {
      data: { id: 1, ok: true, html: "current" },
    }));

    await expect(pending).resolves.toBe("current");
  });
});
