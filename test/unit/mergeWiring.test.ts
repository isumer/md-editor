// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";
import type { FeatureContext } from "../../src/renderer/editor/featureWiring";
import { mergeFeature } from "../../src/renderer/features/merge/wiring";

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
      showStatus: status,
      workspace,
    },
  };
}

afterEach(() => document.body.replaceChildren());

describe("merge wiring", () => {
  it("AC-R15-03: merge command requires three open files", () => {
    const testHarness = harness([record("base", "base\n")]);
    const hooks = mergeFeature.create(testHarness.context);

    hooks.commands?.["file.mergeOpen"]?.();

    expect(testHarness.status).toHaveBeenCalledWith(
      "Open three files. Select the base file, then start merge.",
    );
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
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
});
