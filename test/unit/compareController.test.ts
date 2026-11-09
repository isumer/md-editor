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

function record(name: string, text: string): DocumentRecord {
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
      worker,
      workspace,
    });

    controller.open();
    expect(worker.requests[0]).toMatchObject({ id: 1, highlight: "words" });
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
    workspace.querySelector<HTMLButtonElement>(".compare-button:last-child")?.click();
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
      worker: new FakeWorker(),
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
  });
});
