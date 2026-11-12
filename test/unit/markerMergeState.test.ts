// @vitest-environment jsdom

import { history, redo, undo, undoDepth } from "@codemirror/commands";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMarkerMergeState,
  applyMarkerChanges,
  initializeMarkerMerge,
  initializeThreeWayMerge,
  markerChunkIsValid,
  markerMergeExtension,
  markerMergeState,
  resolveMarkerConflict,
} from "../../src/renderer/features/merge/markerMergeState";
import { createMergeState, type MergeChunk } from "../../src/shared/merge/mergeChunks";

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

function createLargeMerge(chunkCount: number): {
  readonly expectedReads: () => number;
  readonly view: EditorView;
} {
  const text = Array.from({ length: chunkCount }, () => "base\n").join("");
  const chunks: MergeChunk[] = [];
  const expected: string[] = [];
  let reads = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * 5;
    chunks.push({ kind: "conflict", start, end: start + 4, left: "base", right: "side" });
    Object.defineProperty(expected, index, {
      configurable: true,
      get: () => {
        reads += 1;
        return "base";
      },
    });
  }
  const state = EditorState.create({ doc: text, extensions: markerMergeExtension });
  const merge = {
    expected,
    left: text,
    merge: createMergeState(chunks),
    right: text,
  };
  const initialization = initializeThreeWayMerge(state, text, merge);
  if (initialization === null) throw new Error("The large merge was not initialized");
  const view = new EditorView({ parent: document.body, state: state.update(initialization).state });
  views.push(view);
  return { expectedReads: () => reads, view };
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
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
    expect(createMarkerMergeState("<<<<<<< broken\n")).toBeNull();
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
    const unrelated = StateEffect.define<void>();
    const chunk = markerMergeState(view.state)?.merge.chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;
    view.dispatch({
      changes: { from: chunk.start, to: chunk.end, insert: "manual\n" },
      effects: unrelated.of(undefined),
    });

    expect(resolveMarkerConflict(view.state, 0, "right")).toBeNull();
    const merge = markerMergeState(view.state);
    expect(merge === null ? [] : [
      markerChunkIsValid(merge, 0),
      markerChunkIsValid(merge, 1),
    ]).toEqual([false, true]);
    expect(view.state.doc.toString()).toContain("manual");
  });

  it("undo restores a chunk after a manual edit invalidates it", () => {
    const view = createView();
    const chunk = markerMergeState(view.state)?.merge.chunks[0];
    if (chunk === undefined) throw new Error("The first chunk is missing");
    view.dispatch({ changes: { from: chunk.start, to: chunk.end, insert: "manual\n" } });

    undo(view);

    const merge = markerMergeState(view.state);
    expect(merge === null ? false : markerChunkIsValid(merge, 0)).toBe(true);
  });

  it("merge actions return null without an active or applicable merge", () => {
    const plain = EditorState.create({ extensions: markerMergeExtension });
    const view = createView();

    expect(resolveMarkerConflict(plain, 0, "left")).toBeNull();
    expect(applyMarkerChanges(plain)).toBeNull();
    expect(applyMarkerChanges(view.state)).toBeNull();
    const current = markerMergeState(view.state);
    if (current === null) throw new Error("The marker merge is missing");
    expect(initializeThreeWayMerge(view.state, view.state.doc.toString(), current)).toBeNull();
  });

  it("an edit in 200 chunks validates only the affected chunk", () => {
    const large = createLargeMerge(200);

    large.view.dispatch({ changes: { from: 2, to: 3, insert: "x" } });

    expect(large.expectedReads()).toBe(1);
  });

  it("an active merge keystroke update stays below 16 ms at p95", () => {
    const large = createLargeMerge(200);
    const samples: number[] = [];
    for (let index = 0; index < 35; index += 1) {
      const started = performance.now();
      large.view.dispatch({
        changes: { from: large.view.state.doc.length, insert: "x" },
      });
      const duration = performance.now() - started;
      if (index >= 5) samples.push(duration);
    }

    const distribution = samples.map((sample) => sample.toFixed(2)).join(", ");
    console.log(`merge keystroke samples: ${distribution}`);
    expect(samples).toHaveLength(30);
    expect(percentile95(samples)).toBeLessThan(16);
  });
});
