// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { RenderResponse } from "../../src/shared/workers/render";
import { wireRenderWorker } from "../../src/renderer/features/preview/preview";
import { RenderScheduler } from "../../src/renderer/features/preview/renderScheduler";

interface FakeWorker {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface WiringOptions {
  preview?: HTMLElement;
  version?: { docId: string; epoch: number; version: number };
  rewriteHtml?: (html: string) => string;
}

function wiring(options: WiringOptions = {}) {
  const worker: FakeWorker = { onmessage: null, onerror: null };
  const scheduler = new RenderScheduler(() => undefined);
  const preview = options.preview ?? document.createElement("div");
  const showStatus = vi.fn();
  const onResync = vi.fn();
  const rewriteHtml = options.rewriteHtml ?? ((html: string) => html);
  wireRenderWorker(worker, {
    scheduler,
    preview,
    showStatus,
    currentVersion: () => options.version ?? { docId: "doc", epoch: 1, version: 1 },
    onResync,
    rewriteHtml,
  });
  return { worker, preview, showStatus, onResync, rewriteHtml };
}

function send(worker: FakeWorker, response: RenderResponse): void {
  worker.onmessage?.({ data: response } as unknown as MessageEvent<RenderResponse>);
}

function blocks(preview: HTMLElement): HTMLElement[] {
  return [...preview.querySelectorAll<HTMLElement>(".preview-block")];
}

describe("preview render flow", () => {
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
    const { worker, preview, showStatus } = wiring();

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
});
