// @vitest-environment jsdom
/// <reference types="vite/client" />

import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createDocumentRecord } from "../../src/renderer/core/document";
import { DocumentReplication } from "../../src/renderer/core/replication";
import { markerMergeExtension } from "../../src/renderer/editor/editor";
import type { FeatureRegistration } from "../../src/renderer/editor/featureWiring";

const markedText = [
  "<<<<<<< left",
  "left",
  "=======",
  "right",
  ">>>>>>> right",
  "",
].join("\n");

const chooseWorkspaceRoot = vi.fn<Window["api"]["chooseWorkspaceRoot"]>(
  async () => ({ ok: true, value: null }),
);

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { chooseWorkspaceRoot } as unknown as Window["api"],
  });
});

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  chooseWorkspaceRoot.mockClear();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

class FeatureWorker {
  static readonly instances: FeatureWorker[] = [];
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor() {
    FeatureWorker.instances.push(this);
  }

  postMessage(): void {}

  terminate(): void {}
}

function createElements() {
  const workspace = document.createElement("main");
  const editorHost = document.createElement("div");
  editorHost.id = "editor";
  const preview = document.createElement("div");
  preview.id = "preview";
  const sidebarIds = [
    ["workspace-empty", "p"],
    ["workspace-filter", "input"],
    ["workspace-open", "button"],
    ["workspace-title", "h2"],
    ["workspace-tree", "div"],
  ] as const;
  workspace.append(editorHost, preview);
  for (const [id, tag] of sidebarIds) {
    const element = document.createElement(tag);
    element.id = id;
    workspace.append(element);
  }
  document.body.append(workspace);
  return { editorHost, preview, workspace };
}

async function createHarness(active = true, present = true, missingTree = false) {
  const { featureEditorExtensions, installFeatures } = await import(
    "../../src/renderer/features/registry"
  );
  const elements = createElements();
  if (missingTree) {
    globalThis.document.querySelector("#workspace-tree")?.remove();
  }
  const editor = new EditorView({
    parent: elements.editorHost,
    state: EditorState.create({
      doc: markedText,
      extensions: [featureEditorExtensions, markerMergeExtension],
    }),
  });
  views.push(editor);
  const showStatus = vi.fn();
  const document = createDocumentRecord({
    replication: new DocumentReplication(),
    savedText: Text.of(markedText.split("\n")),
    state: editor.state,
  });
  const documents = [document];
  const installed = installFeatures({
    ...elements,
    documents: () => documents,
    editor,
    hasDocument: (documentId) => present && documentId === document.id,
    isActive: (candidate) => active && candidate === document,
    openDocument: vi.fn(async () => undefined),
    showStatus,
  });
  return { document, documents, editor, installed, showStatus, ...elements };
}

async function installCompare(
  harness: Awaited<ReturnType<typeof createHarness>>,
): Promise<void> {
  const { compareFeature } = await import("../../src/renderer/features/compare/wiring");
  harness.installed.installDeferred([compareFeature]);
}

async function installMerge(
  harness: Awaited<ReturnType<typeof createHarness>>,
): Promise<void> {
  const { mergeFeature } = await import("../../src/renderer/features/merge/wiring");
  harness.installed.installDeferred([mergeFeature]);
}

async function installWorkspace(
  harness: Awaited<ReturnType<typeof createHarness>>,
): Promise<void> {
  const { workspaceFeature } = await import(
    "../../src/renderer/features/workspace/workspaceSidebar"
  );
  harness.installed.installDeferred([workspaceFeature]);
}

describe("renderer feature registry", () => {
  it("AC-PERF-03: replays documents into each deferred feature once", async () => {
    const harness = await createHarness();
    const created = vi.fn();
    const activated = vi.fn();
    const registration = {
      editorExtensions: [],
      create: () => ({ documentActivated: activated, documentCreated: created }),
    } satisfies FeatureRegistration;

    harness.installed.installDeferred([registration]);
    harness.installed.installDeferred([registration]);

    expect(created).toHaveBeenCalledOnce();
    expect(created).toHaveBeenCalledWith(harness.document, markedText);
    expect(activated).toHaveBeenCalledOnce();
    expect(activated).toHaveBeenCalledWith(harness.document);
  });

  it("AC-PERF-03: starts a deferred feature once", async () => {
    const harness = await createHarness();
    const start = vi.fn();
    const registration = {
      editorExtensions: [],
      create: () => ({ start }),
    } satisfies FeatureRegistration;

    harness.installed.start();
    harness.installed.installDeferred([registration]);
    harness.installed.start();

    expect(start).toHaveBeenCalledOnce();
  });

  it("AC-PERF-03: keeps deferred extensions off the initial path", async () => {
    const { featureEditorExtensions, rewriteFeatureHtml } = await import(
      "../../src/renderer/features/registry"
    );
    expect(featureEditorExtensions).toHaveLength(0);
    expect(rewriteFeatureHtml('<img src="asset.png">', {
      grant: "Grant_1",
      windowId: 7,
    })).toBe('<img src="doc-asset://7/Grant_1/asset.png">');
  });

  it("forwards lifecycle events to each registered feature", async () => {
    const harness = await createHarness();
    await installMerge(harness);
    await installWorkspace(harness);
    harness.installed.start();
    harness.installed.documentCreated(harness.document, markedText);
    harness.document.state = harness.editor.state;
    harness.installed.documentActivated(harness.document);
    harness.installed.documentStateChanged(harness.document.id, harness.editor.state);

    expect(document.querySelector('[data-testid="merge-view"]')).not.toBeNull();
    const open = document.querySelector<HTMLButtonElement>("#workspace-open");
    expect(open).not.toBeNull();
    open?.click();
    await vi.waitFor(() => expect(chooseWorkspaceRoot).toHaveBeenCalledOnce());

    harness.installed.documentRemoved(harness.document.id);
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("dispatches a registered feature command", async () => {
    vi.stubGlobal("Worker", FeatureWorker);
    const harness = await createHarness();
    await installCompare(harness);

    harness.installed.runCommand("file.compareOpen");

    expect(harness.showStatus).toHaveBeenCalledWith(
      "Open two files before you compare them.",
    );
  });

  it("loads one compare controller for repeated commands", async () => {
    vi.stubGlobal("Worker", FeatureWorker);
    FeatureWorker.instances.length = 0;
    const harness = await createHarness();
    await installCompare(harness);
    harness.documents.push(createDocumentRecord({
      replication: new DocumentReplication(),
      savedText: Text.of(["right"]),
      state: EditorState.create({ doc: "right" }),
    }));

    harness.installed.runCommand("file.compareOpen");
    harness.installed.runCommand("file.compareOpen");
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="compare-view"]')).not.toBeNull();
    });
    harness.installed.runCommand("file.compareOpen");

    expect(FeatureWorker.instances).toHaveLength(1);
  });

  it("ignores an unknown feature command", async () => {
    const harness = await createHarness();

    harness.installed.runCommand("unknown");

    expect(harness.showStatus).not.toHaveBeenCalled();
  });

  it("updates an inactive document without changing the active editor", async () => {
    const harness = await createHarness(false);
    const activeState = harness.editor.state;
    await installMerge(harness);

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.editor.state).toBe(activeState);
    expect(harness.document.state.doc.toString()).toBe("left\n");
  });

  it("ignores merge detection after the document is removed", async () => {
    const harness = await createHarness(true, false);
    const documentState = harness.document.state;
    await installMerge(harness);

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.document.state).toBe(documentState);
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("does not install stale merge detection after the source changes", async () => {
    const harness = await createHarness();
    harness.document.state = harness.document.state.update({
      changes: { from: 0, to: harness.document.state.doc.length, insert: "changed" },
    }).state;
    harness.editor.setState(harness.document.state);
    await installMerge(harness);

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.document.state.doc.toString()).toBe("changed");
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("names a missing workspace element during feature installation", async () => {
    const harness = await createHarness(true, true, true);

    await expect(installWorkspace(harness)).rejects.toThrow(
      "Missing required element: #workspace-tree",
    );
  });
});
