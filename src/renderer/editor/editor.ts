import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type ChangeSet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

import type { DocumentState } from "../core/document";

interface EditorCallbacks {
  onDocumentChanged(text: string): void;
  onChanges(changes: ChangeSet): void;
  updateTitle(): void;
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
          if (!update.docChanged) {
            return;
          }
          if (!documentState.applyingDocument) {
            documentState.dirty = !update.state.doc.eq(documentState.saved);
            callbacks.updateTitle();
            callbacks.onChanges(update.changes);
          }
          callbacks.onDocumentChanged(update.state.doc.toString());
        }),
      ],
    }),
  });
}
