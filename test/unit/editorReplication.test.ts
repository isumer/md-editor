import { EditorState, Text } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import { createDocumentState } from "../../src/renderer/core/document";
import { DocumentReplication } from "../../src/renderer/core/replication";
import { handleDocumentUpdate } from "../../src/renderer/editor/editor";

describe("editor replication performance", () => {
  it("typing defers dirty state work until after the editor transaction", () => {
    const initial = Text.of(["saved"]);
    const state = EditorState.create({ doc: initial });
    const documentState = createDocumentState();
    documentState.saved = initial;
    const onChanges = vi.fn();
    const transaction = state.update({ changes: { from: 0, insert: "x" } });

    handleDocumentUpdate({
      docChanged: transaction.docChanged,
      state: transaction.state,
      changes: transaction.changes,
    }, documentState, {
      onDocumentChanged: vi.fn(),
      onChanges,
    });

    expect(documentState.dirty).toBe(false);
  });

  it("typing sends change messages before it schedules the preview", () => {
    const state = EditorState.create({ doc: "saved" });
    const documentState = createDocumentState();
    const order: string[] = [];
    const transaction = state.update({ changes: { from: 0, insert: "x" } });

    handleDocumentUpdate({
      docChanged: transaction.docChanged,
      state: transaction.state,
      changes: transaction.changes,
    }, documentState, {
      onDocumentChanged: () => order.push("schedule"),
      onChanges: () => order.push("transport"),
    });

    expect(order).toEqual(["transport", "schedule"]);
  });

  it("AC-PERF-05: a one-character edit of 20 MB never flattens the document", () => {
    const initial = Text.of(["x".repeat(20 * 1024 * 1024)]);
    const state = EditorState.create({ doc: initial });
    const replication = new DocumentReplication();
    const documentState = createDocumentState();
    documentState.saved = initial;
    const toString = vi.spyOn(Text.prototype, "toString");
    const concreteTextPrototype = Object.getPrototypeOf(initial) as Pick<Text, "sliceString">;
    const sliceString = vi.spyOn(concreteTextPrototype, "sliceString");
    let changeMessage: ReturnType<DocumentReplication["changed"]> | undefined;

    const transaction = state.update({
      changes: { from: state.doc.length, insert: "!" },
    });
    handleDocumentUpdate({
      docChanged: transaction.docChanged,
      state: transaction.state,
      changes: transaction.changes,
    }, documentState, {
      onDocumentChanged: vi.fn(),
      onChanges: (changes) => {
        changeMessage = replication.changed(changes);
      },
    });

    expect(toString).not.toHaveBeenCalled();
    const wholeDocumentSlices = sliceString.mock.calls.filter(([from, to]) =>
      (from === undefined || from === 0) &&
      (to === undefined || to === initial.length));
    expect(wholeDocumentSlices).toEqual([]);
    expect(JSON.stringify(changeMessage).length).toBeLessThan(1024);
    expect(changeMessage).not.toHaveProperty("text");
  });
});
