// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { RenderResponse } from "../../src/shared/workers/render";
import {
  blockLine,
  wireRenderWorker,
} from "../../src/renderer/features/preview/preview";
import { RenderScheduler } from "../../src/renderer/features/preview/renderScheduler";

interface FakeWorker {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface WiringOptions {
  preview?: HTMLElement;
  version?: { docId: string; epoch: number; version: number };
  rewriteHtml?: (html: string) => string;
}

function wiring(options: WiringOptions = {}) {
  const worker: FakeWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  const scheduler = new RenderScheduler(() => undefined);
  const preview = options.preview ?? document.createElement("div");
  const showStatus = vi.fn();
  const showError = vi.fn();
  const onResync = vi.fn();
  const rewriteHtml = options.rewriteHtml ?? ((html: string) => html);
  const documents = wireRenderWorker(worker, {
    scheduler,
    preview,
    showStatus,
    showError,
    currentVersion: () => options.version ?? { docId: "doc", epoch: 1, version: 1 },
    onResync,
    rewriteHtml,
  });
  return { worker, preview, showStatus, showError, onResync, rewriteHtml, documents };
}

function send(worker: FakeWorker, response: RenderResponse): void {
  worker.onmessage?.({ data: response } as unknown as MessageEvent<RenderResponse>);
}

function blocks(preview: HTMLElement): HTMLElement[] {
  return [...preview.querySelectorAll<HTMLElement>(".preview-block")];
}

describe("preview render flow", () => {
  it("AC-PERF-10: requests one fill after a split append", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { worker, preview } = wiring();
    const renderedBlocks = Array.from({ length: 8 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: renderedBlocks,
      fillToken: 4,
      complete: false,
    });

    vi.runOnlyPendingTimers();
    for (const frame of frames) {
      frame(16);
    }

    expect(blocks(preview)).toHaveLength(8);
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
      op: "fill-ready", docId: "doc", epoch: 1, version: 1, token: 4,
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("AC-PERF-10: applies a newer result after the deferred part", () => {
    vi.useFakeTimers();
    const version = { docId: "doc", epoch: 1, version: 1 };
    const { worker, preview } = wiring({ version });
    const renderedBlocks = Array.from({ length: 8 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: renderedBlocks,
      fillToken: 4,
      complete: false,
    });
    version.version = 2;
    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 2,
      ok: true,
      mode: "append",
      blocks: [{ id: "b8", startLine: 8, endLine: 9, html: "<p>8</p>" }],
      fillToken: 5,
      complete: false,
    });

    expect(blocks(preview).map((block) => block.dataset["blockId"]))
      .toEqual(["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    vi.useRealTimers();
  });

  it("AC-PERF-10: a worker message drains at most four pending blocks", () => {
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
    const { worker, preview } = wiring();
    const renderedBlocks = Array.from({ length: 12 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: renderedBlocks,
      fillToken: 4,
      complete: false,
    });
    send(worker, { op: "resync", id: 2, docId: "doc", epoch: 1, version: 1 });

    expect(blocks(preview).map((block) => block.dataset["blockId"]))
      .toEqual(["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
    expect(frames.size).toBe(1);
    const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (next) {
      frames.delete(next[0]);
      next[1](16);
    }
    vi.runOnlyPendingTimers();
    expect(blocks(preview).map((block) => block.dataset["blockId"]))
      .toEqual(renderedBlocks.map((block) => block.id));
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("AC-PERF-10: drops a pending append when the document changes", () => {
    vi.useFakeTimers();
    const version = { docId: "doc", epoch: 1, version: 1 };
    const { worker, preview } = wiring({ version });
    const renderedBlocks = Array.from({ length: 8 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: renderedBlocks,
      fillToken: 4,
      complete: false,
    });
    version.docId = "next-doc";
    vi.runOnlyPendingTimers();

    expect(blocks(preview).map((block) => block.dataset["blockId"]))
      .toEqual(["b0", "b1", "b2", "b3"]);
    expect(worker.postMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("AC-PERF-10: applies a batch of four blocks in one task", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { worker, preview } = wiring();
    const renderedBlocks = Array.from({ length: 4 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: renderedBlocks,
      fillToken: 4,
      complete: false,
    });

    expect(blocks(preview)).toHaveLength(4);
    expect(frames).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("AC-PERF-10: records the apply boundary marker names", () => {
    const mark = vi.spyOn(performance, "mark");
    const { worker } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" }],
      fillToken: 4,
      complete: false,
    });

    expect(mark.mock.calls.map(([name]) => name)).toEqual([
      "preview-apply-start",
      "preview-apply-end",
    ]);
    mark.mockRestore();
  });

  it("AC-PERF-10: clears the previous apply boundary marks", () => {
    const clearMarks = vi.spyOn(performance, "clearMarks");
    const { worker } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" }],
      fillToken: 4,
      complete: false,
    });

    expect(clearMarks.mock.calls.map(([name]) => name)).toEqual([
      "preview-apply-start",
      "preview-apply-end",
    ]);
    clearMarks.mockRestore();
  });

  it("AC-PERF-10: waits for a frame before it requests the next fill batch", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const { worker } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" }],
      fillToken: 4,
      complete: false,
    });
    vi.unstubAllGlobals();

    expect(worker.postMessage).not.toHaveBeenCalled();
    frames[0]?.(16);
    expect(worker.postMessage).toHaveBeenCalledWith({
      op: "fill-ready", docId: "doc", epoch: 1, version: 1, token: 4,
    });
  });

  it("AC-PERF-09: limits each visibility section to 100 preview blocks", () => {
    const { worker, preview } = wiring();
    const renderedBlocks = Array.from({ length: 101 }, (_, index) => ({
      id: `b${String(index)}`,
      startLine: index,
      endLine: index + 1,
      html: `<p>${String(index)}</p>`,
    }));

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: renderedBlocks,
      complete: true,
    });

    const sections = [...preview.querySelectorAll(".preview-section")];
    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.querySelectorAll(".preview-block").length))
      .toEqual([100, 1]);
  });

  it("AC-R1-07: ignores a render result from an older document epoch", () => {
    const preview = document.createElement("div");
    preview.innerHTML = "<p>current preview</p>";
    const { worker, showStatus, onResync } = wiring({ preview });

    send(worker, {
      id: 7,
      docId: "doc-1",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>stale preview</p>" }],
      complete: true,
    });

    expect(preview.innerHTML).toBe("<p>current preview</p>");
    expect(showStatus).not.toHaveBeenCalled();
    expect(onResync).not.toHaveBeenCalled();
  });

  it("AC-R1-07: ignores a result older than the version already shown", () => {
    const preview = document.createElement("div");
    const { worker } = wiring({ preview, version: { docId: "doc", epoch: 1, version: 3 } });

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 3,
      ok: true,
      mode: "replace",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>newest</p>" }],
      complete: true,
    });
    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 2,
      ok: true,
      mode: "replace",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>stale</p>" }],
      complete: true,
    });

    expect(preview.textContent).toBe("newest");
  });

  it("AC-R1-05: applies ordered patches even when the editor has moved on", () => {
    const preview = document.createElement("div");
    const { worker } = wiring({ preview, version: { docId: "doc", epoch: 1, version: 2 } });

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [
        { id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" },
        { id: "b2", startLine: 2, endLine: 3, html: "<p>two</p>" },
      ],
      complete: true,
    });
    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 2,
      ok: true,
      mode: "patch",
      blocks: [{
        block: { id: "b3", startLine: 2, endLine: 3, html: "<p>two edited</p>" },
        after: "b1",
      }],
      removed: ["b2"],
      complete: true,
    });

    expect(blocks(preview).map((element) => element.textContent))
      .toEqual(["one", "two edited"]);
  });

  it("AC-R1-07: forwards a resync only for the current document epoch", () => {
    const { worker, onResync } = wiring({
      version: { docId: "doc", epoch: 3, version: 5 },
    });
    const current = { op: "resync", id: 2, docId: "doc", epoch: 3, version: 4 } as const;
    const old = { op: "resync", id: 1, docId: "doc", epoch: 2, version: 4 } as const;

    send(worker, old);
    send(worker, current);

    expect(onResync).toHaveBeenCalledOnce();
    expect(onResync).toHaveBeenCalledWith(current);
  });

  it("AC-SEC-16: sanitises before rewriting and applies the rewritten HTML", () => {
    const rewriteHtml = vi.fn((html: string) =>
      html.replace('src="pic.png"', 'src="doc-asset://1/grant/pic.png"'));
    const { worker, preview } = wiring({ rewriteHtml });

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [{
        id: "b1",
        startLine: 0,
        endLine: 1,
        html: '<img src="pic.png" onerror="bad()">',
      }],
      complete: true,
    });

    const rewrittenInput = rewriteHtml.mock.calls[0]?.[0] ?? "";
    expect(rewrittenInput).not.toContain("onerror");
    expect(preview.querySelector("img")?.getAttribute("src"))
      .toBe("doc-asset://1/grant/pic.png");
  });

  it("AC-R1-06: a failed render keeps the last good preview and the next success replaces it", () => {
    const { worker, preview, showStatus, showError } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>good</p>" }],
      complete: true,
    });
    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: false,
      message: "render failed",
    });

    expect(preview.textContent).toBe("good");
    expect(showStatus).toHaveBeenLastCalledWith("render failed");
    expect(showError).toHaveBeenLastCalledWith("render failed");

    send(worker, {
      id: 3,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "patch",
      blocks: [{
        block: { id: "b1", startLine: 0, endLine: 1, html: "<p>recovered</p>" },
        after: null,
      }],
      removed: [],
      complete: true,
    });

    expect(preview.textContent).toBe("recovered");
    expect(showStatus).toHaveBeenLastCalledWith();
    expect(showError).toHaveBeenLastCalledWith();
  });

  it("AC-R1-09: patches only the changed block and keeps other blocks' DOM nodes", () => {
    const { worker, preview } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [
        { id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" },
        { id: "b2", startLine: 2, endLine: 3, html: "<p>two</p>" },
        { id: "b3", startLine: 4, endLine: 5, html: "<p>three</p>" },
      ],
      complete: true,
    });
    const elements = blocks(preview);

    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "patch",
      blocks: [{
        block: { id: "b3", startLine: 4, endLine: 5, html: "<p>three edited</p>" },
        after: "b2",
      }],
      removed: [],
      complete: true,
    });

    expect(blocks(preview)).toEqual(elements);
    expect(blocks(preview)[2]?.textContent).toBe("three edited");
    expect(blocks(preview)[0]?.textContent).toBe("one");
    expect(blocks(preview)[1]?.textContent).toBe("two");
  });

  it("AC-R1-09: inserts a new block after its anchor and removes deleted blocks", () => {
    const { worker, preview } = wiring();

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [
        { id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" },
        { id: "b2", startLine: 2, endLine: 3, html: "<p>two</p>" },
      ],
      complete: true,
    });

    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "patch",
      blocks: [{
        block: { id: "b3", startLine: 4, endLine: 5, html: "<p>three</p>" },
        after: "b1",
      }],
      removed: ["b2"],
      complete: true,
    });

    expect(blocks(preview).map((element) => element.textContent))
      .toEqual(["one", "three"]);
  });

  it("AC-R4-01: a switch back keeps the cached nodes but resumes an unfinished fill", () => {
    const preview = document.createElement("div");
    const { worker, documents } = wiring({
      preview,
      version: { docId: "doc", epoch: 1, version: 1 },
    });

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [{ id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" }],
      complete: false,
    });
    const first = blocks(preview);

    // The fill pass was still running when the window switched away, so the
    // cached preview is incomplete: the switch back must ask for a render.
    expect(documents.show({ docId: "doc", epoch: 1, version: 1 })).toBe(false);

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "append",
      blocks: [{ id: "b2", startLine: 2, endLine: 3, html: "<p>two</p>" }],
      fillToken: 1,
      complete: true,
    });

    expect(documents.show({ docId: "doc", epoch: 1, version: 1 })).toBe(true);
    const shown = blocks(preview);
    expect(shown.map((element) => element.textContent)).toEqual(["one", "two"]);
    expect(shown[0]?.isSameNode(first[0] ?? null)).toBe(true);
  });

  it("AC-R1-04: a block's line follows lines inserted above it after it was rendered", () => {
    const preview = document.createElement("div");
    const { worker } = wiring({
      preview,
      version: { docId: "doc", epoch: 1, version: 2 },
    });

    send(worker, {
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: true,
      mode: "replace",
      blocks: [
        { id: "b1", startLine: 0, endLine: 1, html: "<p>one</p>" },
        { id: "b2", startLine: 2, endLine: 3, html: "<p>two</p>" },
        { id: "b3", startLine: 4, endLine: 5, html: "<p>three</p>" },
      ],
      complete: true,
    });
    const elements = blocks(preview);

    // Two lines are inserted above: the changed block is re-sent and the
    // blocks after it learn the shift from the ledger, without a re-render.
    send(worker, {
      id: 2,
      docId: "doc",
      epoch: 1,
      version: 2,
      ok: true,
      mode: "patch",
      blocks: [{
        block: { id: "b1", startLine: 2, endLine: 3, html: "<p>one</p>" },
        after: null,
      }],
      removed: [],
      lineShifts: [{ after: "b1", delta: 2 }],
      complete: true,
    });

    expect(elements.map((element) => element.dataset["line"])).toEqual(["2", "2", "4"]);
    expect(elements.map((element) => blockLine(element))).toEqual([2, 4, 6]);
  });

});
