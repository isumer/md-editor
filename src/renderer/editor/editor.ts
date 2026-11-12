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
import {
  EditorState,
  type ChangeSet,
  type Extension,
  type Text,
} from "@codemirror/state";
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
  onChanges(changes: ChangeSet, state: EditorState): void;
  onStateChanged?(state: EditorState): void;
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

function plainTextRunEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const code = text.charCodeAt(end);
    const isDigit = code >= 48 && code <= 57;
    const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!isDigit && !isLetter) break;
    end += 1;
  }
  return end;
}

// Plain word runs contain no Markdown delimiters, so parse them in one step.
const markdownSupport = markdown({
  extensions: {
    parseInline: [{
      name: "PlainTextRun",
      before: "Escape",
      parse: (context, _next, position) => {
        const start = position - context.offset;
        const end = plainTextRunEnd(context.text, start);
        return end === start ? -1 : context.offset + end;
      },
    }],
  },
});

// Four MiB keeps 500 KiB highlighted and gives 20 MiB documents ample separation.
export const MARKDOWN_LANGUAGE_MAX_LENGTH = 4 * 1024 * 1024;

export function dispatchUndo(view: EditorView): void {
  undo(view);
}

export function dispatchRedo(view: EditorView): void {
  redo(view);
}

// The marks let performance tests attribute keystroke latency per phase
// (docs/dev/briefs/perf-slow-machine-tail.md F2); they stay quiet on green.
export function handleDocumentUpdate(
  update: DocumentUpdate,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): void {
  performance.mark("editor-update-start");
  performance.mark("editor-state-hooks-start");
  callbacks.onStateChanged?.(update.state);
  performance.mark("editor-state-hooks-end");
  if (!update.docChanged) {
    performance.mark("editor-update-end");
    return;
  }
  if (!documentState.applyingDocument) {
    performance.mark("editor-change-hooks-start");
    callbacks.onChanges(update.changes, update.state);
    performance.mark("editor-change-hooks-end");
  }
  performance.mark("editor-document-hooks-start");
  callbacks.onDocumentChanged();
  performance.mark("editor-document-hooks-end");
  performance.mark("editor-update-end");
}

export function createEditorState(
  document: Text | string,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
  extension: Extension = [],
): EditorState {
  return EditorState.create({
    doc: document,
    extensions: [
      editorSetup,
      extension,
      ...(document.length <= MARKDOWN_LANGUAGE_MAX_LENGTH ? [markdownSupport] : []),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        handleDocumentUpdate(update, documentState, callbacks);
      }),
    ],
  });
}

export function createEditor(
  editorHost: HTMLElement,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
  initialState?: EditorState,
): EditorView {
  return new EditorView({
    parent: editorHost,
    state: initialState ?? createEditorState("", documentState, callbacks),
  });
}

export * from "./markerMergeState";

