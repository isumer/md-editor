// @vitest-environment jsdom
/// <reference types="vite/client" />

import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createDocumentRecord } from "../../src/renderer/core/document";
import { DocumentReplication } from "../../src/renderer/core/replication";

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
  document.body.replaceChildren();
});

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
    state: EditorState.create({ doc: markedText, extensions: featureEditorExtensions }),
  });
  views.push(editor);
  const showStatus = vi.fn();
  const document = createDocumentRecord({
    replication: new DocumentReplication(),
    savedText: Text.of(markedText.split("\n")),
    state: editor.state,
  });
  const installed = installFeatures({
    ...elements,
    editor,
    hasDocument: (documentId) => present && documentId === document.id,
    isActive: (candidate) => active && candidate === document,
    openDocument: vi.fn(async () => undefined),
    showStatus,
  });
  return { document, editor, installed, showStatus, ...elements };
}

describe("renderer feature registry", () => {
  it("composes each feature extension and HTML rewrite", async () => {
    const { featureEditorExtensions, rewriteFeatureHtml } = await import(
      "../../src/renderer/features/registry"
    );
    expect(featureEditorExtensions.length).toBeGreaterThan(0);
    expect(rewriteFeatureHtml('<img src="asset.png">', {
      grant: "Grant_1",
      windowId: 7,
    })).toBe('<img src="doc-asset://7/Grant_1/asset.png">');
  });

  it("forwards lifecycle events to each registered feature", async () => {
    const harness = await createHarness();
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

  it("updates an inactive document without changing the active editor", async () => {
    const harness = await createHarness(false);
    const activeState = harness.editor.state;

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.editor.state).toBe(activeState);
    expect(harness.document.state.doc.toString()).toBe("left\n");
  });

  it("ignores merge detection after the document is removed", async () => {
    const harness = await createHarness(true, false);
    const documentState = harness.document.state;

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.document.state).toBe(documentState);
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("does not install stale merge detection after the source changes", async () => {
    const harness = await createHarness();
    harness.document.state = harness.document.state.update({
      changes: { from: 0, to: harness.document.state.doc.length, insert: "changed" },
    }).state;

    harness.installed.documentCreated(harness.document, markedText);

    expect(harness.document.state.doc.toString()).toBe("changed");
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("names a missing workspace element during feature installation", async () => {
    await expect(createHarness(true, true, true)).rejects.toThrow(
      "Missing required element: #workspace-tree",
    );
  });
});
