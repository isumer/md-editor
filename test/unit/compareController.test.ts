// @vitest-environment jsdom

import { EditorState, Text } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import { CompareController } from "../../src/renderer/features/compare/controller";
import { createCompareState } from "../../src/renderer/features/compare/state";
import type {
  CompareWorkerRequest,
  CompareWorkerResponse,
} from "../../src/shared/workers/compare";
import type { DocumentRecord } from "../../src/renderer/core/document";

class FakeWorker {
  onmessage: ((event: MessageEvent<CompareWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: CompareWorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage(request: CompareWorkerRequest): void {
    this.requests.push(request);
  }

  respond(response: CompareWorkerResponse): void {
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }

  fail(): void {
    this.onerror?.(new ErrorEvent("error"));
  }
}

function record(name: string | null, text: string): DocumentRecord {
  return {
    name,
    saved: { text: Text.of(text.split("\n")) },
    state: EditorState.create({ doc: text }),
  } as DocumentRecord;
}

describe("compare controller", () => {
  it("AC-R14-01 AC-R14-02 AC-R14-07: shows current results and handles controls", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    workspace.append(editor, preview);
    document.body.replaceChildren(workspace);
    Element.prototype.scrollIntoView = vi.fn();
    const documents = [record("left.txt", "old word"), record("right.txt", "new word")];
    const worker = new FakeWorker();
    const showStatus = vi.fn();
    const controller = new CompareController({
      documents: () => documents,
      editor,
      preview,
      showStatus,
      workerFactory: () => worker,
      workspace,
    });

    controller.open();
    expect(worker.requests[0]).toMatchObject({ id: 1, highlight: "words" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));
    worker.respond({ id: 0, ok: true, state: createCompareState("x", "y", "words") });
    expect(workspace.querySelector(".compare-view")?.hasAttribute("hidden")).toBe(true);
    worker.respond({
      id: 1,
      ok: true,
      state: createCompareState("old word", "new word", "words"),
    });

    expect(editor.hidden).toBe(true);
    expect(workspace.querySelector(".compare-changed")?.textContent).toBe("old");
    const select = workspace.querySelector<HTMLSelectElement>(".compare-highlight");
    expect(select).not.toBeNull();
    if (select) {
      select.value = "characters";
      select.dispatchEvent(new Event("change"));
    }
    expect(worker.requests[1]).toMatchObject({ id: 2, highlight: "characters" });
    worker.respond({
      id: 2,
      ok: true,
      state: createCompareState("old word", "new word", "characters"),
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", shiftKey: true }));
    workspace.querySelector<HTMLButtonElement>(".compare-previous")?.click();
    workspace.querySelector<HTMLButtonElement>(".compare-button:last-child")?.click();
    if (select) select.dispatchEvent(new Event("change"));
    controller.close();
    expect(editor.hidden).toBe(false);
    expect(preview.hidden).toBe(false);
  });

  it("requires two open documents", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    workspace.append(editor, preview);
    const showStatus = vi.fn();
    const controller = new CompareController({
      documents: () => [record("one.txt", "one")],
      editor,
      preview,
      showStatus,
      workerFactory: () => new FakeWorker(),
      workspace,
    });

    controller.open();

    expect(showStatus).toHaveBeenCalledWith("Open two files before you compare them.");
    expect(editor.hidden).toBe(false);
  });

  it("restores exact hidden states and names a worker error", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    preview.setAttribute("hidden", "until-found");
    workspace.append(editor, preview);
    const first = new FakeWorker();
    const second = new FakeWorker();
    const showStatus = vi.fn();
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor,
      preview,
      showStatus,
      workerFactory: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      workspace,
    });

    controller.open();
    first.fail();

    expect(editor.hasAttribute("hidden")).toBe(false);
    expect(preview.getAttribute("hidden")).toBe("until-found");
    expect(workspace.classList.contains("compare-open")).toBe(false);
    expect(showStatus).toHaveBeenCalledWith("The compare worker stopped unexpectedly.");
  });

  it("uses a new worker after an error", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    workspace.append(editor, preview);
    const first = new FakeWorker();
    const second = new FakeWorker();
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor,
      preview,
      showStatus: vi.fn(),
      workerFactory: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
      workspace,
    });

    controller.open();
    first.fail();
    expect(first.terminate).toHaveBeenCalledOnce();
    controller.open();
    const request = second.requests[0];
    expect(request).toBeDefined();
    if (!request) return;
    second.respond({
      id: request.id,
      ok: true,
      state: createCompareState("left", "right", "words"),
    });

    expect(workspace.querySelector(".compare-view")?.hasAttribute("hidden")).toBe(false);
  });

  it("opening compare twice preserves the original hidden states", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    preview.setAttribute("hidden", "until-found");
    workspace.append(editor, preview);
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor,
      preview,
      showStatus: vi.fn(),
      workerFactory: () => new FakeWorker(),
      workspace,
    });

    controller.open();
    controller.open();
    controller.close();

    expect(editor.hasAttribute("hidden")).toBe(false);
    expect(preview.getAttribute("hidden")).toBe("until-found");
  });

  it("F7 keeps rows outside the moved selection", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const workspace = document.createElement("main");
    const worker = new FakeWorker();
    new CompareController({
      documents: () => [
        record("left.txt", "one\nsame\ntwo\nsame again\nthree"),
        record("right.txt", "ONE\nsame\nTWO\nsame again\nTHREE"),
      ],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace,
    }).open();
    worker.respond({
      id: 1,
      ok: true,
      state: createCompareState(
        "one\nsame\ntwo\nsame again\nthree",
        "ONE\nsame\nTWO\nsame again\nTHREE",
        "words",
      ),
    });
    const stableRows = [...workspace.querySelectorAll<HTMLElement>(".compare-row")]
      .filter((row) => row.dataset.changeIndex !== "0" && row.dataset.changeIndex !== "1");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));

    const currentRows = [...workspace.querySelectorAll<HTMLElement>(".compare-row")];
    expect(stableRows.length).toBeGreaterThan(0);
    expect(stableRows.every((row) => currentRows.includes(row))).toBe(true);
  });

  it("restores the surface and shows a rejected response message", () => {
    const workspace = document.createElement("main");
    const editor = document.createElement("section");
    const preview = document.createElement("section");
    editor.setAttribute("hidden", "until-found");
    workspace.append(editor, preview);
    const worker = new FakeWorker();
    const showStatus = vi.fn();
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor,
      preview,
      showStatus,
      workerFactory: () => worker,
      workspace,
    });

    controller.open();
    worker.respond({ id: 1, ok: false, message: "Compare failed." });

    expect(editor.getAttribute("hidden")).toBe("until-found");
    expect(preview.hasAttribute("hidden")).toBe(false);
    expect(workspace.classList.contains("compare-open")).toBe(false);
    expect(showStatus).toHaveBeenCalledWith("Compare failed.");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("creates a browser worker from the configured URL", () => {
    const created: Array<{ options: WorkerOptions; url: URL }> = [];
    class BrowserWorker extends FakeWorker {
      constructor(url: URL, options: WorkerOptions) {
        super();
        created.push({ options, url });
      }
    }
    vi.stubGlobal("Worker", BrowserWorker);
    const workspace = document.createElement("main");
    const workerUrl = new URL("https://example.test/compare.js");

    new CompareController({
      documents: () => [],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workerUrl,
      workspace,
    });

    expect(created).toEqual([{ options: { type: "module" }, url: workerUrl }]);
    vi.unstubAllGlobals();
  });

  it("requires a worker or worker URL", () => {
    expect(() => new CompareController({
      documents: () => [],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workspace: document.createElement("main"),
    })).toThrow("A compare worker URL is required.");
  });

  it("labels unnamed compare documents", () => {
    const workspace = document.createElement("main");
    const worker = new FakeWorker();
    const controller = new CompareController({
      documents: () => [record(null, "left"), record(null, "right")],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace,
    });

    controller.open();
    worker.respond({
      id: 1,
      ok: true,
      state: createCompareState("left", "right", "words"),
    });

    expect(workspace.querySelector(".compare-headings")?.textContent)
      .toBe("UntitledUntitled");
  });

  it("AC-R14-04: compares a dirty buffer with saved text and clipboard text", async () => {
    const workspace = document.createElement("main");
    const worker = new FakeWorker();
    const dirty = record("dirty.txt", "current text");
    dirty.saved = { ...dirty.saved, text: Text.of(["saved text"]) };
    const controller = new CompareController({
      documents: () => [record("other.txt", "other"), dirty],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      readClipboard: async () => "clipboard text",
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace,
    });
    controller.open();
    worker.respond({
      id: 1,
      ok: true,
      state: createCompareState("other", "current text", "words"),
    });

    workspace.querySelector<HTMLButtonElement>(".compare-saved")?.click();
    expect(worker.requests[1]).toMatchObject({
      left: "current text",
      right: "saved text",
    });
    worker.respond({
      id: 2,
      ok: true,
      state: createCompareState("current text", "saved text", "words"),
    });
    expect(workspace.querySelector(".compare-headings")?.textContent)
      .toBe("dirty.txt (current)dirty.txt (saved)");

    workspace.querySelector<HTMLButtonElement>(".compare-clipboard")?.click();
    await Promise.resolve();
    expect(worker.requests[2]).toMatchObject({
      left: "current text",
      right: "clipboard text",
    });
  });

  it("AC-R14-05: a chunk arrow applies one change in one editor transaction", () => {
    const workspace = document.createElement("main");
    const worker = new FakeWorker();
    const applyRight = vi.fn();
    const controller = new CompareController({
      applyRight,
      documents: () => [
        record("left.txt", "left first\nsame\nleft second"),
        record("right.txt", "right first\nsame\nright second"),
      ],
      editor: document.createElement("section"),
      isActive: (document) => document.name === "right.txt",
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace,
    });
    controller.open();
    worker.respond({
      id: 1,
      ok: true,
      state: createCompareState(
        "left first\nsame\nleft second",
        "right first\nsame\nright second",
        "words",
      ),
    });

    workspace.querySelector<HTMLButtonElement>('[data-testid="compare-apply-1"]')?.click();

    expect(applyRight).toHaveBeenCalledOnce();
    expect(applyRight).toHaveBeenCalledWith("right first\nsame\nleft second");
    expect(worker.requests[1]).toMatchObject({
      left: "left first\nsame\nleft second",
      right: "right first\nsame\nleft second",
    });
  });

  it("reports a clipboard read failure and ignores source controls after close", async () => {
    const workspace = document.createElement("main");
    const showStatus = vi.fn();
    const readText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus,
      workerFactory: () => new FakeWorker(),
      workspace,
    });
    controller.open();

    workspace.querySelector<HTMLButtonElement>(".compare-clipboard")?.click();
    await vi.waitFor(() => expect(readText).toHaveBeenCalledOnce());
    expect(showStatus).toHaveBeenCalledWith("SolidMD could not read the clipboard.");
    controller.close();
    workspace.querySelector<HTMLButtonElement>(".compare-saved")?.click();
    workspace.querySelector<HTMLButtonElement>(".compare-clipboard")?.click();
    await Promise.resolve();

    expect(showStatus).toHaveBeenCalledOnce();
  });

  it("does not compare the same document object twice", () => {
    const documentRecord = record("same.txt", "same");
    const worker = new FakeWorker();
    const controller = new CompareController({
      documents: () => [documentRecord, documentRecord],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace: document.createElement("main"),
    });

    controller.open();

    expect(worker.requests).toEqual([]);
  });

  it("uses word highlighting when a source changes before the first result", async () => {
    const workspace = document.createElement("main");
    const worker = new FakeWorker();
    const controller = new CompareController({
      documents: () => [record("left.txt", "left"), record("right.txt", "right")],
      editor: document.createElement("section"),
      preview: document.createElement("section"),
      readClipboard: async () => "clipboard",
      showStatus: vi.fn(),
      workerFactory: () => worker,
      workspace,
    });
    controller.open();

    workspace.querySelector<HTMLButtonElement>(".compare-saved")?.click();
    workspace.querySelector<HTMLButtonElement>(".compare-clipboard")?.click();
    await Promise.resolve();

    expect(worker.requests.map((request) => request.highlight))
      .toEqual(["words", "words", "words"]);
  });
});
