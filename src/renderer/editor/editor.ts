import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

import type { DocumentState } from "../core/document";

export function createEditor(
  editorHost: HTMLElement,
  documentState: DocumentState,
  onDocumentChanged: (text: string) => void,
  updateTitle: () => void,
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
            documentState.dirty = true;
            updateTitle();
          }
          onDocumentChanged(update.state.doc.toString());
        }),
      ],
    }),
  });
}
