// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";
import type { FeatureContext } from "../../src/renderer/editor/featureWiring";

const exportDocument = vi.fn(async (_request: unknown) =>
  ({ ok: true as const, value: undefined }));

class ExportWorker {
  static readonly messages: unknown[] = [];
  static automaticReplies = true;
  static readonly instances: ExportWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    ExportWorker.instances.push(this);
  }
  postMessage(message: unknown): void {
    ExportWorker.messages.push(message);
    if (!ExportWorker.automaticReplies) return;
    const request = message as { id: number };
    queueMicrotask(() => this.onmessage?.(new MessageEvent("message", {
      data: { id: request.id, ok: true, html: "<!doctype html><h1>Exported</h1>" },
    })));
  }
  reply(id: number, heading: string): void {
    this.onmessage?.(new MessageEvent("message", {
      data: { id, ok: true, html: `<!doctype html><h1>${heading}</h1>` },
    }));
  }
}

function context(): FeatureContext {
  const preview = document.createElement("div");
  preview.dataset["renderComplete"] = "true";
  const block = document.createElement("div");
  block.className = "preview-block";
  block.dataset["blockId"] = "one";
  block.innerHTML = '<h1>Heading</h1><img src="doc-asset://4/grant/images/picture.png">';
  preview.append(block);
  const active = {
    name: "note.md",
    state: { doc: { toString: () => "# Heading" } },
  } as unknown as DocumentRecord;
  return {
    documents: () => [active],
    editor: {} as FeatureContext["editor"],
    editorHost: document.createElement("div"),
    hasDocument: () => true,
    isActive: (candidate) => candidate === active,
    openDocument: async () => undefined,
    preview,
    showStatus: vi.fn(),
    workspace: document.createElement("div"),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  ExportWorker.messages.length = 0;
  ExportWorker.instances.length = 0;
  ExportWorker.automaticReplies = true;
  document.body.replaceChildren();
  vi.stubGlobal("Worker", ExportWorker);
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { exportDocument },
  });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
});

describe("export controller", () => {
  it("AC-R6-01 AC-R6-02: requests a light HTML export from the active preview", async () => {
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const exportContext = context();
    const hooks = exportFeature.create(exportContext);

    hooks.commands?.["file.exportHtml"]?.();
    const dialog = document.querySelector<HTMLDialogElement>("[data-testid=export-dialog]");
    const alwaysLight = document.querySelector<HTMLInputElement>("[data-testid=export-always-light]");
    if (!dialog || !alwaysLight) throw new Error("The export dialog did not open");
    const block = exportContext.preview.querySelector<HTMLElement>("[data-block-id]");
    if (!block) throw new Error("The preview block is missing");
    Object.defineProperty(block, "innerHTML", {
      configurable: true,
      get: () => { throw new Error("Export read the live preview DOM"); },
    });
    alwaysLight.checked = true;
    dialog.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    await vi.waitFor(() => expect(exportDocument).toHaveBeenCalledWith({
      format: "html",
      html: "<!doctype html><h1>Exported</h1>",
      suggestedName: "note.html",
    }));
    expect(ExportWorker.messages[0]).toMatchObject({
      input: {
        alwaysLight: true,
        blocks: [{ html: '<h1>Heading</h1><img src="images/picture.png">' }],
        theme: "dark",
      },
    });
  });

  it("AC-R6-01 AC-R6-04: keeps concurrent export formats and options immutable", async () => {
    ExportWorker.automaticReplies = false;
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(context());

    hooks.commands?.["file.exportHtml"]?.();
    const dialog = document.querySelector<HTMLDialogElement>("[data-testid=export-dialog]");
    if (!dialog) throw new Error("The export dialog did not open");
    dialog.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    hooks.commands?.["file.exportPdf"]?.();
    const pageSize = dialog.querySelector<HTMLSelectElement>("select");
    const margin = dialog.querySelector<HTMLInputElement>('input[type="number"]');
    if (!pageSize || !margin) throw new Error("PDF options are missing");
    pageSize.value = "Letter";
    margin.value = "1";
    dialog.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    const worker = ExportWorker.instances[0];
    if (!worker) throw new Error("The export worker is missing");
    worker.reply(2, "Second");
    worker.reply(1, "First");

    await vi.waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(2));
    expect(exportDocument.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({
        format: "pdf",
        html: "<!doctype html><h1>Second</h1>",
        options: expect.objectContaining({ pageSize: "Letter" }),
      }),
      {
        format: "html",
        html: "<!doctype html><h1>First</h1>",
        suggestedName: "note.html",
      },
    ]);
  });

  it("AC-R6-03 AC-R6-04: sends the selected PDF options", async () => {
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(context());

    hooks.commands?.["file.exportPdf"]?.();
    const dialog = document.querySelector<HTMLDialogElement>("[data-testid=export-dialog]");
    const pageSize = dialog?.querySelector<HTMLSelectElement>("select");
    const margin = dialog?.querySelector<HTMLInputElement>('input[type="number"]');
    const background = [...(dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])][1];
    if (!dialog || !pageSize || !margin || !background) throw new Error("PDF options are missing");
    pageSize.value = "Letter";
    margin.value = "1";
    background.checked = false;
    dialog.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    await vi.waitFor(() => expect(exportDocument).toHaveBeenCalledWith(expect.objectContaining({
      format: "pdf",
      suggestedName: "note.pdf",
      options: {
        pageSize: "Letter",
        margins: { top: 1, bottom: 1, left: 1, right: 1 },
        printBackground: false,
      },
    })));
  });

  it("AC-R6-01: reports an incomplete preview and closes on cancellation", async () => {
    const exportContext = context();
    exportContext.preview.dataset["renderComplete"] = "false";
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(exportContext);
    hooks.commands?.["file.exportHtml"]?.();
    const dialog = document.querySelector<HTMLDialogElement>("[data-testid=export-dialog]");
    if (!dialog) throw new Error("The export dialog did not open");
    dialog.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    await vi.waitFor(() => expect(exportContext.showStatus)
      .toHaveBeenCalledWith("The preview is still rendering"));

    hooks.commands?.["file.exportHtml"]?.();
    dialog.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
    expect(dialog.open).toBe(false);
  });

  it("AC-R6-01: reports when no document is open", async () => {
    const exportContext = context();
    exportContext.documents = () => [];
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(exportContext);
    hooks.commands?.["file.exportHtml"]?.();
    document.querySelector<HTMLFormElement>("[data-testid=export-dialog] form")
      ?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    await vi.waitFor(() => expect(exportContext.showStatus)
      .toHaveBeenCalledWith("No document is open"));
  });

  it("AC-R6-01: reports a non-Error export rejection", async () => {
    exportDocument.mockRejectedValueOnce("transport failed");
    const exportContext = context();
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(exportContext);
    hooks.commands?.["file.exportHtml"]?.();
    document.querySelector<HTMLFormElement>("[data-testid=export-dialog] form")
      ?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    await vi.waitFor(() => expect(exportContext.showStatus)
      .toHaveBeenCalledWith("transport failed"));
  });

  it("AC-R6-02 AC-R6-04: uses light defaults and reports an export failure", async () => {
    const exportContext = context();
    const active = exportContext.documents()[0];
    if (!active) throw new Error("The active document is missing");
    active.name = null;
    exportContext.preview.querySelector<HTMLElement>("[data-block-id]")
      ?.removeAttribute("data-block-id");
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
    exportDocument.mockResolvedValueOnce({
      ok: false,
      error: { code: "DISK_FULL", messageKey: "file.diskFull", params: {}, retryable: false },
    } as never);
    const { exportFeature } = await import("../../src/renderer/features/export/wiring");
    const hooks = exportFeature.create(exportContext);
    hooks.commands?.["file.exportPdf"]?.();
    document.querySelector<HTMLFormElement>("[data-testid=export-dialog] form")
      ?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));

    await vi.waitFor(() => expect(exportDocument).toHaveBeenCalledWith(expect.objectContaining({
      format: "pdf",
      suggestedName: "Untitled.pdf",
      options: expect.objectContaining({ pageSize: "A4" }),
    })));
    await vi.waitFor(() => expect(exportContext.showStatus)
      .toHaveBeenCalledWith("Could not save “{file}”: the disk is full."));
    expect(ExportWorker.messages[0]).toMatchObject({
      input: { theme: "light", title: "Untitled" },
    });
  });
});
