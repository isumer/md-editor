// @vitest-environment jsdom

import { EditorState, type TransactionSpec } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMarkerMergeState,
  initializeMarkerMerge,
  markerMergeExtension,
} from "../../src/renderer/features/merge/markerMergeState";
import { MergeView, type MergeEditor } from "../../src/renderer/features/merge/mergeView";

const markedText = [
  "before",
  "<<<<<<< left",
  "left one",
  "=======",
  "right one",
  ">>>>>>> right",
  "between",
  "<<<<<<< left",
  "left two",
  "=======",
  "right two",
  ">>>>>>> right",
  "after",
  "",
].join("\n");

interface Harness {
  editor: MergeEditor;
  mergeView: MergeView;
  state: EditorState;
}

function createHarness(
  parse: typeof createMarkerMergeState = vi.fn(createMarkerMergeState),
): Harness {
  const editorHost = document.createElement("div");
  const preview = document.createElement("div");
  const workspace = document.createElement("main");
  workspace.append(editorHost, preview);
  document.body.append(workspace);
  const harness: Harness = {
    editor: { state: EditorState.create() } as MergeEditor,
    mergeView: {} as MergeView,
    state: EditorState.create({ doc: markedText, extensions: markerMergeExtension }),
  };
  harness.editor = {
    get state() {
      return harness.state;
    },
    dispatch(spec: TransactionSpec) {
      harness.state = harness.state.update(spec).state;
      harness.mergeView.stateChanged("one", harness.state);
    },
  };
  harness.mergeView = new MergeView({ editorHost, editor: harness.editor, parse, preview, workspace });
  return harness;
}

function detect(harness: Harness, id = "one", text = markedText): void {
  harness.mergeView.detect(id, text, (merge) => {
    const spec = initializeMarkerMerge(harness.state, text, merge);
    if (spec !== null) harness.state = harness.state.update(spec).state;
  });
}

afterEach(() => document.body.replaceChildren());

describe("merge view", () => {
  it("uses the marker parser when no parser is supplied", () => {
    const harness = createHarness(createMarkerMergeState);
    const editorHost = document.createElement("div");
    const preview = document.createElement("div");
    const workspace = document.createElement("main");
    workspace.append(editorHost, preview);
    const view = new MergeView({ editor: harness.editor, editorHost, preview, workspace });

    view.detect("default", "ordinary text\n", () => undefined);
    view.activate("default", harness.state);

    expect(workspace.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("shows three panes, a toolbar and the conflict counter", () => {
    const harness = createHarness();
    detect(harness);

    harness.mergeView.activate("one", harness.state);

    expect(document.querySelectorAll(".merge-pane")).toHaveLength(3);
    expect(document.querySelector(".merge-toolbar")).not.toBeNull();
    expect(document.querySelector('[data-testid="merge-conflicts-left"]')?.textContent)
      .toBe("2 conflicts left");
  });

  it("uses singular at one conflict and plural at zero conflicts", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);

    document.querySelector<HTMLButtonElement>('[data-testid="merge-conflict-1-left"]')?.click();
    expect(document.querySelector('[data-testid="merge-conflicts-left"]')?.textContent)
      .toBe("1 conflict left");
    document.querySelector<HTMLButtonElement>('[data-testid="merge-conflict-2-left"]')?.click();
    expect(document.querySelector('[data-testid="merge-conflicts-left"]')?.textContent)
      .toBe("0 conflicts left");
  });

  it("disables resolved choices and keeps unresolved choices enabled", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);

    document.querySelector<HTMLButtonElement>('[data-testid="merge-conflict-1-left"]')?.click();

    expect(document.querySelector<HTMLButtonElement>(
      '[data-testid="merge-conflict-1-right"]',
    )?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>(
      '[data-testid="merge-conflict-2-right"]',
    )?.disabled).toBe(false);
  });

  it("detects once and reuses the panes when the same document activates twice", () => {
    const parse = vi.fn(createMarkerMergeState);
    const harness = createHarness(parse);
    detect(harness);
    harness.mergeView.activate("one", harness.state);
    const root = document.querySelector('[data-testid="merge-view"]');

    detect(harness);
    harness.mergeView.activate("one", harness.state);

    expect(parse).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="merge-view"]')).toBe(root);
  });

  it("swaps the cached session when a different document activates", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);
    const first = document.querySelector('[data-testid="merge-view"]');
    harness.mergeView.detect("two", markedText, () => undefined);

    harness.mergeView.activate("two", harness.state);

    expect(document.querySelector('[data-testid="merge-view"]')).not.toBe(first);
    harness.mergeView.activate("one", harness.state);
    expect(document.querySelector('[data-testid="merge-view"]')).toBe(first);
  });

  it("ignores state changes for inactive documents", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);
    const counter = document.querySelector('[data-testid="merge-conflicts-left"]');

    harness.mergeView.stateChanged(null, harness.state);
    harness.mergeView.stateChanged("two", harness.state);

    expect(counter?.textContent).toBe("2 conflicts left");
  });

  it("forgets the active session and hides the merge view", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);

    harness.mergeView.forget("one");

    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("forgets an inactive session without hiding the active view", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);

    harness.mergeView.forget("two");

    expect(document.querySelector('[data-testid="merge-view"]')).not.toBeNull();
  });

  it("does not overwrite a chunk after its text becomes stale", () => {
    const harness = createHarness();
    detect(harness);
    harness.mergeView.activate("one", harness.state);
    harness.editor.dispatch({ changes: { from: 7, to: 16, insert: "manual\n" } });

    document.querySelector<HTMLButtonElement>('[data-testid="merge-conflict-1-right"]')?.click();

    expect(harness.state.doc.toString()).toContain("manual");
  });

  it("does not show a merge view for a document without markers", () => {
    const harness = createHarness();
    detect(harness, "plain", "ordinary text\n");

    harness.mergeView.activate("plain", harness.state);

    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });
});
