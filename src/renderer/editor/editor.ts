import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type ChangeSet } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { basicSetup } from "codemirror";

import type { DocumentState } from "../core/document";

export interface EditorCallbacks {
  onDocumentChanged(): void;
  onChanges(changes: ChangeSet): void;
  updateTitle(): void;
}

type DocumentUpdate = Pick<ViewUpdate, "docChanged" | "state" | "changes">;

export function handleDocumentUpdate(
  update: DocumentUpdate,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): void {
  if (!update.docChanged) {
    return;
  }
  if (!documentState.applyingDocument) {
    documentState.dirty = !update.state.doc.eq(documentState.saved);
    callbacks.updateTitle();
    callbacks.onChanges(update.changes);
  }
  callbacks.onDocumentChanged();
}

export function createEditor(
  editorHost: HTMLElement,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): EditorView {
  return new EditorView({
    parent: editorHost,
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          handleDocumentUpdate(update, documentState, callbacks);
        }),
      ],
    }),
  });
}
