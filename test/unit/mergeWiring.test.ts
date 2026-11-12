// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";
import type { FeatureContext } from "../../src/renderer/editor/featureWiring";
import { createThreeWayMerge } from "../../src/renderer/features/merge/threeWayMerge";
import { createMergeFeature } from "../../src/renderer/features/merge/wiring";
import type { MergeWorkerPort } from "../../src/renderer/features/merge/workerClient";

function workerFactory(): MergeWorkerPort {
  const port: MergeWorkerPort = {
    onerror: null,
    onmessage: null,
    postMessage(request) {
      port.onmessage?.({
        data: {
          id: request.id,
          ok: true,
          result: createThreeWayMerge(request.base, request.left, request.right),
        },
      } as MessageEvent);
    },
    terminate: vi.fn(),
  };
  return port;
}

const mergeFeature = createMergeFeature(workerFactory);

interface Harness {
  readonly context: FeatureContext;
  readonly editor: EditorView;
  readonly status: ReturnType<typeof vi.fn>;
}

function record(id: string, text: string): DocumentRecord {
  return {
    id,
    name: `${id}.txt`,
    state: EditorState.create({ doc: text, extensions: mergeFeature.editorExtensions }),
  } as unknown as DocumentRecord;
}

function harness(documents: readonly DocumentRecord[]): Harness {
  const active = documents[documents.length - 1];
  if (active === undefined) throw new Error("A harness needs an active document");
  const editorHost = document.createElement("div");
  const preview = document.createElement("div");
  const workspace = document.createElement("main");
  workspace.append(editorHost, preview);
  document.body.append(workspace);
  const editor = new EditorView({ state: active.state, parent: editorHost });
  const status = vi.fn();
  return {
    editor,
    status,
    context: {
      documents: () => documents,
      editor,
      editorHost,
      hasDocument: (id) => documents.some((item) => item.id === id),
      isActive: (item) => item === active,
      openDocument: async () => undefined,
      preview,
      removeDocument: vi.fn(),
      showStatus: status,
      workspace,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("merge wiring", () => {
  it("uses the platform worker when no worker factory is supplied", () => {
    const worker = workerFactory();
    worker.postMessage = vi.fn();
    const WorkerStub = vi.fn(function WorkerStub() {
      return worker;
    });
    vi.stubGlobal("Worker", WorkerStub);
    const feature = createMergeFeature();
    const testHarness = harness([
      record("left", "left\n"),
      record("right", "right\n"),
      record("base", "base\n"),
    ]);
    const hooks = feature.create(testHarness.context);

    hooks.commands?.["file.mergeOpen"]?.();

    expect(WorkerStub).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledOnce();
    testHarness.editor.destroy();
  });

  it("AC-R15-03: merge command requires two open files", () => {
    const testHarness = harness([record("base", "base\n")]);
    const hooks = mergeFeature.create(testHarness.context);

    hooks.commands?.["file.mergeOpen"]?.();

    expect(testHarness.status).toHaveBeenCalledWith(
      "Open two files. Select the left file, then start merge.",
    );
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
    testHarness.editor.destroy();
  });

  it("AC-R15-03: two open files start the centre from the active left file", async () => {
    const testHarness = harness([
      record("right", "right\n"),
      record("left", "left\n"),
    ]);
    const hooks = mergeFeature.create(testHarness.context);

    hooks.commands?.["file.mergeOpen"]?.();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="merge-view"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-testid="merge-left"]')?.textContent)
      .toContain("left");
    expect(document.querySelector('[data-testid="merge-right"]')?.textContent)
      .toContain("right");
    expect(testHarness.editor.state.doc.toString()).toBe("left\n");
    testHarness.editor.destroy();
  });

  it("AC-R15-03: merge command uses the active file as the base", async () => {
    const testHarness = harness([
      record("left", "left\n"),
      record("right", "right\n"),
      record("base", "base\n"),
    ]);
    const hooks = mergeFeature.create(testHarness.context);

    hooks.commands?.["file.mergeOpen"]?.();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="merge-view"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-testid="merge-left"]')?.textContent)
      .toContain("left");
    expect(document.querySelector('[data-testid="merge-right"]')?.textContent)
      .toContain("right");
    expect(testHarness.editor.state.doc.toString()).toBe("base\n");
    hooks.documentStateChanged?.("base", testHarness.editor.state);
    hooks.documentActivated?.(record("plain", "plain\n"));
    hooks.documentRemoved?.("base");
    testHarness.editor.destroy();
  });

  it("discards a merge result after the active document changes", () => {
    const delayed = workerFactory();
    delayed.postMessage = vi.fn();
    const feature = createMergeFeature(() => delayed);
    const testHarness = harness([
      record("left", "left\n"),
      record("right", "right\n"),
      record("base", "base\n"),
    ]);
    const hooks = feature.create(testHarness.context);
    hooks.commands?.["file.mergeOpen"]?.();
    testHarness.editor.dispatch({ changes: { from: 0, insert: "changed " } });
    const request = vi.mocked(delayed.postMessage).mock.calls[0]?.[0];
    if (request === undefined) throw new Error("The worker request was not sent");

    delayed.onmessage?.({
      data: {
        id: request.id,
        ok: true,
        result: createThreeWayMerge(request.base, request.left, request.right),
      },
    } as MessageEvent);

    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
    expect(testHarness.editor.state.doc.toString()).toBe("changed base\n");
    testHarness.editor.destroy();
  });

  it("AC-R15-03: keeps a merge result after a selection-only change", async () => {
    const delayed = workerFactory();
    delayed.postMessage = vi.fn();
    const feature = createMergeFeature(() => delayed);
    const testHarness = harness([
      record("left", "left\n"),
      record("right", "right\n"),
      record("base", "base\n"),
    ]);
    const hooks = feature.create(testHarness.context);
    hooks.commands?.["file.mergeOpen"]?.();
    testHarness.editor.dispatch({ selection: { anchor: 1 } });
    const request = vi.mocked(delayed.postMessage).mock.calls[0]?.[0];
    if (request === undefined) throw new Error("The worker request was not sent");

    delayed.onmessage?.({
      data: {
        id: request.id,
        ok: true,
        result: createThreeWayMerge(request.base, request.left, request.right),
      },
    } as MessageEvent);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="merge-view"]')).not.toBeNull();
    });
    expect(testHarness.editor.state.selection.main.head).toBe(1);
    testHarness.editor.destroy();
  });
});
