// @vitest-environment jsdom

import { EditorState, type TransactionSpec } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMarkerMergeState,
  initializeMarkerMerge,
  initializeThreeWayMerge,
  markerMergeExtension,
} from "../../src/renderer/features/merge/markerMergeState";
import { MergeView, type MergeEditor } from "../../src/renderer/features/merge/mergeView";
import { createThreeWayMergeState } from "../../src/renderer/features/merge/threeWayMerge";

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

function installThreeWay(harness: Harness): void {
  const base = "a\nbase one\nmiddle\nbase two\nz\n";
  const merge = createThreeWayMergeState(
    base,
    "a\nleft one\nmiddle\nbase two\nz\nleft end\n",
    "a\nright one\nmiddle\nright two\nz\nright end\n",
  );
  const state = EditorState.create({ doc: base, extensions: markerMergeExtension });
  const spec = initializeThreeWayMerge(state, base, merge);
  if (spec === null) throw new Error("The merge state was not installed");
  harness.state = state.update(spec).state;
  harness.mergeView.install("one");
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

  it("AC-R15-03: a three-way merge shows read-only sides and an editable base", () => {
    const harness = createHarness();
    installThreeWay(harness);

    harness.mergeView.activate("one", harness.state);

    expect(document.querySelector('[data-testid="merge-left"]')?.textContent)
      .toContain("left one");
    expect(document.querySelector('[data-testid="merge-right"]')?.textContent)
      .toContain("right two");
    expect(harness.state.doc.toString()).toBe("a\nbase one\nmiddle\nbase two\nz\n");
    expect(document.querySelector('[data-testid="merge-left"] pre')).not.toBeNull();
    expect(document.querySelector('[data-testid="merge-right"] pre')).not.toBeNull();
  });

  it("AC-R15-05: apply changes uses one transaction and leaves conflicts", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);

    document.querySelector<HTMLButtonElement>('[data-testid="merge-apply-changes"]')?.click();

    expect(harness.state.doc.toString()).toContain("right two");
    expect(document.querySelector('[data-testid="merge-counts"]')?.textContent)
      .toBe("0 changes, 2 conflicts left");
    expect(harness.state.doc.toString()).not.toContain("left one");
  });

  it("AC-R15-10: F7 and Shift+F7 move between unresolved chunks", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));
    const first = harness.state.selection.main.head;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));
    const second = harness.state.selection.main.head;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", shiftKey: true }));

    expect(second).toBeGreaterThan(first);
    expect(harness.state.selection.main.head).toBe(first);
    expect(document.querySelector('[data-testid="merge-counts"]')?.textContent)
      .toBe("1 change, 2 conflicts left");
  });

  it("ignores repeated and inactive merge actions", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);
    const apply = document.querySelector<HTMLButtonElement>(
      '[data-testid="merge-apply-changes"]',
    );
    const choice = document.querySelector<HTMLButtonElement>(
      '[data-testid="merge-conflict-1-left"]',
    );

    apply?.click();
    const afterApply = harness.state;
    apply?.click();
    choice?.click();
    if (choice !== null) choice.disabled = false;
    choice?.click();
    harness.mergeView.activate("plain", EditorState.create());
    apply?.click();
    choice?.click();

    expect(afterApply.doc.toString()).toContain("right two");
    expect(document.querySelector('[data-testid="merge-view"]')).toBeNull();
  });

  it("ignores merge navigation after the editor loses its merge state", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);
    harness.state = EditorState.create();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F7" }));

    expect(harness.state.selection.main.head).toBe(0);
  });

  it("keeps the active shell unchanged after its merge state is removed", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);
    const counts = document.querySelector('[data-testid="merge-counts"]')?.textContent;
    harness.state = EditorState.create();

    harness.mergeView.stateChanged("one", harness.state);

    expect(document.querySelector('[data-testid="merge-counts"]')?.textContent)
      .toBe(counts);
  });

  it("ignores conflict choices from a shell after its document closes", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);
    const choice = document.querySelector<HTMLButtonElement>(
      '[data-testid="merge-conflict-1-left"]',
    );
    const before = harness.state;
    harness.mergeView.forget("one");

    choice?.click();

    expect(harness.state).toBe(before);
  });

  it("leaves merge navigation keys with modifiers available to the platform", () => {
    const harness = createHarness();
    installThreeWay(harness);
    harness.mergeView.activate("one", harness.state);
    const event = new KeyboardEvent("keydown", { ctrlKey: true, key: "F7", cancelable: true });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(harness.state.selection.main.head).toBe(0);
  });
});
