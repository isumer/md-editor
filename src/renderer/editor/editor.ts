import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
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
  Compartment,
  EditorState,
  type ChangeSet,
  type Extension,
  type StateEffect,
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
  deferDirtyState?: boolean;
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
const callbacksCompartment = new Compartment();

const plainMarkdownTemplate = markdown().language.parser.parse("x");
const plainMarkdownParagraph = plainMarkdownTemplate.topNode.firstChild?.type;
const plainMarkdownPattern = /^[A-Za-z0-9]+$/;
// Lezer otherwise scans an entire unbroken line before honoring its parse budget.
type MarkdownTree = typeof plainMarkdownTemplate;
const MarkdownTree = plainMarkdownTemplate.constructor as new (
  type: MarkdownTree["type"],
  children: readonly MarkdownTree[],
  positions: readonly number[],
  length: number,
) => MarkdownTree;

function plainMarkdownParse(length: number) {
  let stoppedAt: number | null = null;
  return {
    advance: () => {
      const parsedLength = stoppedAt ?? length;
      const children =
        plainMarkdownParagraph === undefined
          ? []
          : [new MarkdownTree(plainMarkdownParagraph, [], [], parsedLength)];
      const positions = children.length === 0 ? [] : [0];
      return new MarkdownTree(
        plainMarkdownTemplate.type,
        children,
        positions,
        parsedLength,
      );
    },
    get parsedPos() {
      return stoppedAt ?? length;
    },
    stopAt: (position: number) => {
      stoppedAt = position;
    },
    get stoppedAt() {
      return stoppedAt;
    },
  };
}

const markdownSupport = markdown({
  extensions: {
    // Plain word runs contain no Markdown delimiters, so parse them in one step.
    parseInline: [{
      name: "PlainTextRun",
      before: "Escape",
      parse: (context, _next, position) => {
        const start = position - context.offset;
        const end = plainTextRunEnd(context.text, start);
        return end === start ? -1 : context.offset + end;
      },
    }],
    wrap: (inner, input) => {
      const text = input.chunk(0);
      return text.length === input.length &&
        text.length > 64 * 1024 &&
        plainMarkdownPattern.test(text)
        ? plainMarkdownParse(input.length)
        : inner;
    },
  },
});

function callbacksExtension(
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): Extension {
  return EditorView.updateListener.of((update) => {
    handleDocumentUpdate(update, documentState, callbacks);
  });
}

export function editorCallbacksEffect(
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): StateEffect<unknown> {
  return callbacksCompartment.reconfigure(callbacksExtension(documentState, callbacks));
}

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

// The highlight palette follows the theme, so dark text never sits on a dark surface.
const highlightCompartment = new Compartment();
let darkHighlight = false;

function highlightExtension(): Extension {
  return darkHighlight
    ? [EditorView.darkTheme.of(true), syntaxHighlighting(oneDarkHighlightStyle)]
    : syntaxHighlighting(defaultHighlightStyle, { fallback: true });
}

export function setEditorDarkTheme(view: EditorView, dark: boolean): void {
  darkHighlight = dark;
  view.dispatch({ effects: highlightCompartment.reconfigure(highlightExtension()) });
}
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
  if (!update.docChanged) {
    performance.mark("editor-state-hooks-start");
    callbacks.onStateChanged?.(update.state);
    performance.mark("editor-state-hooks-end");
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
  // Document clones must catch the change before state observers read the view.
  performance.mark("editor-state-hooks-start");
  callbacks.onStateChanged?.(update.state);
  performance.mark("editor-state-hooks-end");
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
      highlightCompartment.of(highlightExtension()),
      extension,
      ...(document.length <= MARKDOWN_LANGUAGE_MAX_LENGTH ? [markdownSupport] : []),
      EditorView.lineWrapping,
      callbacksCompartment.of(callbacksExtension(documentState, callbacks)),
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

