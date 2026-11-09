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
    worker.respond({ id: 2, ok: false, message: "compare failed" });
    expect(showStatus).toHaveBeenCalledWith("compare failed");
    worker.onerror?.(new ErrorEvent("error"));
    expect(showStatus).toHaveBeenCalledWith("The compare worker stopped unexpectedly.");

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
});
