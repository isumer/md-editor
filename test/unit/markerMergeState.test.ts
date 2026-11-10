// @vitest-environment jsdom

import { history, redo, undo, undoDepth } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMarkerMergeState,
  initializeMarkerMerge,
  markerMergeExtension,
  markerMergeState,
  resolveMarkerConflict,
} from "../../src/renderer/features/merge/markerMergeState";

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

const views: EditorView[] = [];

function createView(): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: markedText,
      extensions: [history(), markerMergeExtension],
    }),
  });
  views.push(view);
  const merge = createMarkerMergeState(markedText);
  expect(merge).not.toBeNull();
  if (merge !== null) {
    const initialization = initializeMarkerMerge(view.state, markedText, merge);
    expect(initialization).not.toBeNull();
    if (initialization !== null) view.dispatch(initialization);
  }
  return view;
}

function choose(view: EditorView, index: number, choice: "left" | "right" | "both"): void {
  const transaction = resolveMarkerConflict(view.state, index, choice);
  expect(transaction).not.toBeNull();
  if (transaction !== null) view.dispatch(transaction);
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("marker merge state", () => {
  it("AC-R15-06: starts a marker result from the left side", () => {
    const view = createView();

    expect(view.state.doc.toString()).toBe("before\nleft one\nbetween\nleft two\nafter\n");
  });

  it("AC-R15-06: creates one conflict for each marker block", () => {
    const state = markerMergeState(createView().state);

    expect(state?.merge.chunks).toHaveLength(2);
    expect(state?.merge.resolved).toEqual([false, false]);
  });

  it("AC-R15-06: rejects text without conflict marker blocks", () => {
    expect(createMarkerMergeState("ordinary text\n")).toBeNull();
  });

  it("AC-R15-04: two choices create two normal history entries", () => {
    const view = createView();

    choose(view, 0, "right");
    choose(view, 1, "both");

    expect(undoDepth(view.state)).toBe(2);
    expect(view.state.doc.toString()).toBe(
      "before\nright one\nbetween\nleft two\nright two\nafter\n",
    );
  });

  it("AC-R15-04: two normal undos restore each merge state and consume history", () => {
    const view = createView();
    choose(view, 0, "right");
    const afterFirst = view.state.doc.toString();
    choose(view, 1, "both");

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(afterFirst);
    expect(markerMergeState(view.state)?.merge.resolved).toEqual([true, false]);
    expect(undoDepth(view.state)).toBe(1);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("before\nleft one\nbetween\nleft two\nafter\n");
    expect(markerMergeState(view.state)?.merge.resolved).toEqual([false, false]);
    expect(undoDepth(view.state)).toBe(0);
  });

  it("AC-R15-04: redo restores the accepted choice and merge state", () => {
    const view = createView();
    choose(view, 0, "right");
    undo(view);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toContain("right one");
    expect(markerMergeState(view.state)?.merge.resolved).toEqual([true, false]);
  });

  it("undo with empty history leaves the editor state unchanged", () => {
    const view = createView();
    const initial = view.state;

    expect(undo(view)).toBe(false);
    expect(view.state).toBe(initial);
  });

  it("a manual edit before a chunk is preserved and maps the choice position", () => {
    const view = createView();
    view.dispatch({ changes: { from: 0, insert: "note\n" } });

    choose(view, 1, "right");

    expect(view.state.doc.toString()).toBe(
      "note\nbefore\nleft one\nbetween\nright two\nafter\n",
    );
  });

  it("a manual edit inside a chunk disables its choice", () => {
    const view = createView();
    const chunk = markerMergeState(view.state)?.merge.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;
    view.dispatch({ changes: { from: chunk.start, to: chunk.end, insert: "manual\n" } });

    expect(resolveMarkerConflict(view.state, 0, "right")).toBeNull();
    expect(markerMergeState(view.state)?.valid).toEqual([false, true]);
    expect(view.state.doc.toString()).toContain("manual");
  });
});
