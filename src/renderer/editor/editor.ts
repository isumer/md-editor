import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type ChangeSet } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from "@codemirror/view";

import type { DocumentState } from "../core/document";

export interface EditorCallbacks {
  onDocumentChanged(): void;
  onChanges(changes: ChangeSet): void;
  updateTitle(): void;
  onStateChanged?(): void;
}

type DocumentUpdate = Pick<ViewUpdate, "docChanged" | "state" | "changes">;

// CodeMirror's basicSetup also binds undo/redo in historyKeymap. The renderer keymap
// owns every chord, so this copy keeps history() but omits that keymap.
const editorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

export function dispatchUndo(view: EditorView): void {
  undo(view);
}

export function dispatchRedo(view: EditorView): void {
  redo(view);
}

export function handleDocumentUpdate(
  update: DocumentUpdate,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): void {
  callbacks.onStateChanged?.();
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
        editorSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          handleDocumentUpdate(update, documentState, callbacks);
        }),
      ],
    }),
  });
}
