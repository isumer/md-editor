// @vitest-environment jsdom

import { EditorState, Text } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDocumentRecord, type DocumentRecord } from "../../src/renderer/core/document";
import type { RenderResponse } from "../../src/shared/workers/render";

class FakeWorker {
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly terminate = vi.fn();
  throwOnPost = false;

  postMessage(message: unknown): void {
    if (this.throwOnPost) {
      this.throwOnPost = false;
      throw new Error("worker stopped");
    }
    this.messages.push(message);
  }
}

const workers: FakeWorker[] = [];

function item(docId = "doc", epoch = 1, version = 1): DocumentRecord {
  return createDocumentRecord({
    name: "note.md",
    replication: {
      current: () => ({ docId, epoch, version }),
      changed: () => ({
        op: "change", docId, epoch, fromVersion: version, toVersion: version + 1, changes: [],
      }),
    },
    savedText: Text.of(["note"]),
    state: EditorState.create({ doc: "note" }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.stubGlobal("Worker", class {
    constructor() {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { openExternal: vi.fn(async () => ({ ok: true, value: undefined })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function controller(current: () => DocumentRecord | null) {
  const { RenderController } = await import("../../src/renderer/tabs/renderController");
  const preview = document.createElement("div");
  document.body.replaceChildren(preview);
  const showError = vi.fn();
  const instance = new RenderController({
    current,
    preview,
    restartMessage: "restarted",
    rewriteHtml: (html) => html,
    showError,
    showStatus: vi.fn(),
    workerUrl: new URL("https://example.test/worker.js"),
  });
  return { instance, preview, showError };
}

describe("render controller", () => {
  it("AC-PERF-11: attach reuses the text the caller supplies", async () => {
    const document = item();
    const { instance } = await controller(() => document);

    instance.attach(document, "serialized once");

    expect(workers[0]?.messages).toContainEqual({
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 1,
      text: "serialized once",
    });
  });

  it("AC-R1-07: attach without supplied text sends the document text", async () => {
    const document = item();
    const { instance } = await controller(() => document);

    instance.attach(document);

    expect(workers[0]?.messages).toContainEqual({
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 1,
      text: "note",
    });
  });

  it("AC-R1-12: heartbeat pongs continue pinging and a timeout restarts the worker", async () => {
    const document = item();
    const { instance, preview, showError } = await controller(() => document);
    instance.start();
    const first = workers[0];
    expect(first?.messages).toContainEqual({ op: "ping", id: 1 });
    await vi.advanceTimersByTimeAsync(0);
    first?.onmessage?.({ data: {
      id: 1, docId: "doc", epoch: 1, version: 1, ok: true, mode: "replace",
      blocks: [{ id: "block", startLine: 0, endLine: 1, html: "<p>note</p>" }],
      complete: true,
    } } as unknown as MessageEvent<RenderResponse>);
    expect(preview.textContent).toBe("note");
    first?.onmessage?.({ data: { op: "pong", id: 1 } } as MessageEvent<RenderResponse>);
    await vi.advanceTimersByTimeAsync(500);
    expect(first?.messages).toContainEqual({ op: "ping", id: 2 });

    await vi.advanceTimersByTimeAsync(1_500);

    expect(first?.terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    expect(workers[1]?.messages[0]).toMatchObject({ op: "attach", docId: "doc" });
    expect(showError).toHaveBeenCalledWith("restarted");
    // The new worker knows no cached preview, so the old blocks must go.
    expect(preview.childElementCount).toBe(0);
  });

  it("AC-R1-07: an epoch resync attaches only the current document", async () => {
    const document = item("doc", 3, 5);
    const { instance } = await controller(() => document);
    instance.start();
    const worker = workers[0];

    worker?.onmessage?.({
      data: { op: "resync", id: 1, docId: "doc", epoch: 2, version: 4 },
    } as MessageEvent<RenderResponse>);
    worker?.onmessage?.({
      data: { op: "resync", id: 2, docId: "doc", epoch: 3, version: 4 },
    } as MessageEvent<RenderResponse>);

    expect(worker?.messages.filter((message) =>
      (message as { op?: string }).op === "attach")).toHaveLength(1);
  });

  it("AC-R4-01: a missing cache schedules render and detach drops the cached preview", async () => {
    const document = item();
    const { instance, preview } = await controller(() => document);
    instance.start();
    const worker = workers[0];
    instance.change({
      op: "change", docId: "doc", epoch: 1, fromVersion: 0, toVersion: 1, changes: [],
    });
    instance.schedule();
    instance.activate(document);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker?.messages).toContainEqual({ op: "render", id: 1, docId: "doc", epoch: 1, version: 1 });
    worker?.onmessage?.({ data: {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [{ id: "block", startLine: 0, endLine: 1, html: "<p>note</p>" }],
      complete: true,
    } } as unknown as MessageEvent<RenderResponse>);
    expect(preview.textContent).toBe("note");
    worker?.onerror?.(new ErrorEvent("error", { message: "worker error" }));
    worker?.onmessage?.({ data: {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: [],
      fillToken: 4,
      complete: true,
    } } as unknown as MessageEvent<RenderResponse>);
    // Fill acknowledgements are paced to the next animation frame.
    await vi.advanceTimersByTimeAsync(0);
    expect(worker?.messages).toContainEqual({
      op: "fill-ready", docId: "doc", epoch: 1, version: 1, token: 4,
    });
    const rendersBeforeCachedShow = worker?.messages.filter((message) =>
      (message as { op?: string }).op === "render").length;
    instance.activate(document);
    await vi.advanceTimersByTimeAsync(0);
    expect(worker?.messages.filter((message) =>
      (message as { op?: string }).op === "render")).toHaveLength(
        rendersBeforeCachedShow ?? 0,
      );

    instance.detach("doc");
    expect(preview.childElementCount).toBe(0);
    instance.activate(document);
    await vi.advanceTimersByTimeAsync(0);

    expect(worker?.messages).toContainEqual({ op: "detach", docId: "doc" });
    expect(worker?.messages).toContainEqual({ op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });
  });

  it("AC-R1-12: a ping transport failure restarts the worker", async () => {
    const { instance } = await controller(() => null);
    const first = workers[0];
    if (first) first.throwOnPost = true;

    instance.start();
    await vi.advanceTimersByTimeAsync(0);
    workers[1]?.onmessage?.({ data: {
      id: 1,
      docId: "document-none",
      epoch: 0,
      version: 0,
      ok: false,
      message: "none",
    } } as unknown as MessageEvent<RenderResponse>);

    expect(first?.terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
  });
});
