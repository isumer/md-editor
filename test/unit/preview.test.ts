// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { RenderResponse } from "../../src/shared/workers/render";
import { wireRenderWorker } from "../../src/renderer/features/preview/preview";
import { RenderScheduler } from "../../src/renderer/features/preview/renderScheduler";

interface FakeWorker {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

describe("preview render flow", () => {
  it("AC-R1-07: ignores a render result from an older document epoch", () => {
    const worker: FakeWorker = { onmessage: null, onerror: null };
    const scheduler = new RenderScheduler(() => undefined);
    const preview = document.createElement("div");
    preview.innerHTML = "<p>current preview</p>";
    const showStatus = vi.fn();
    const onResync = vi.fn();
    wireRenderWorker(
      worker,
      {
        scheduler,
        preview,
        showStatus,
        currentVersion: () => ({ docId: "doc-2", epoch: 2, version: 0 }),
        onResync,
        rewriteHtml: (html) => html,
      },
    );

    worker.onmessage?.({ data: {
      id: 7,
      docId: "doc-1",
      epoch: 1,
      version: 4,
      ok: true,
      html: "<p>stale preview</p>",
    } } as unknown as MessageEvent<RenderResponse>);

    expect(preview.innerHTML).toBe("<p>current preview</p>");
    expect(showStatus).not.toHaveBeenCalled();
    expect(onResync).not.toHaveBeenCalled();
  });

  it("AC-R1-07: forwards a resync only for the current document epoch", () => {
    const worker: FakeWorker = { onmessage: null, onerror: null };
    const scheduler = new RenderScheduler(() => undefined);
    const onResync = vi.fn();
    wireRenderWorker(
      worker,
      {
        scheduler,
        preview: document.createElement("div"),
        showStatus: vi.fn(),
        currentVersion: () => ({ docId: "doc", epoch: 3, version: 5 }),
        onResync,
        rewriteHtml: (html) => html,
      },
    );
    const current = { op: "resync", id: 2, docId: "doc", epoch: 3, version: 4 } as const;
    const old = { op: "resync", id: 1, docId: "doc", epoch: 2, version: 4 } as const;

    worker.onmessage?.({ data: old } as unknown as MessageEvent<RenderResponse>);
    worker.onmessage?.({ data: current } as unknown as MessageEvent<RenderResponse>);

    expect(onResync).toHaveBeenCalledOnce();
    expect(onResync).toHaveBeenCalledWith(current);
  });

  it("AC-SEC-16: sanitises before rewriting and applies the rewritten HTML", () => {
    const worker: FakeWorker = { onmessage: null, onerror: null };
    const scheduler = new RenderScheduler(() => undefined);
    const preview = document.createElement("div");
    const showStatus = vi.fn();
    const rewriteHtml = vi.fn((html: string) =>
      html.replace('src="pic.png"', 'src="doc-asset://1/grant/pic.png"'));
    wireRenderWorker(
      worker,
      {
        scheduler,
        preview,
        showStatus,
        currentVersion: () => ({ docId: "doc", epoch: 0, version: 1 }),
        onResync: vi.fn(),
        rewriteHtml,
      },
    );

    worker.onmessage?.({ data: {
      id: 1,
      docId: "doc",
      epoch: 0,
      version: 1,
      ok: true,
      html: '<img src="pic.png" onerror="bad()">',
    } } as unknown as MessageEvent<RenderResponse>);

    const rewrittenInput = rewriteHtml.mock.calls[0]?.[0] ?? "";
    expect(rewrittenInput).not.toContain("onerror");
    expect(preview.innerHTML).toBe('<img src="doc-asset://1/grant/pic.png">');
    expect(showStatus).toHaveBeenCalledWith();
  });
});
