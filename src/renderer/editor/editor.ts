import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, invertedEffects, redo, undo } from "@codemirror/commands";
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
  StateEffect,
  StateField,
  Transaction,
  type ChangeSet,
  type Extension,
  type Text,
  type TransactionSpec,
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
import {
  parseConflictFile,
  type ConflictFile,
} from "../../shared/merge/conflictMarkers";
import {
  acceptChunk,
  applyNonConflicting,
  createMergeState,
  type ChunkChoice,
  type MergeChunk,
  type MergeState,
} from "../../shared/merge/mergeChunks";

export interface EditorCallbacks {
  onDocumentChanged(): void;
  onChanges(changes: ChangeSet, state: EditorState): void;
  updateTitle(): void;
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

export function handleDocumentUpdate(
  update: DocumentUpdate,
  documentState: DocumentState,
  callbacks: EditorCallbacks,
): void {
  callbacks.onStateChanged?.(update.state);
  if (!update.docChanged) {
    return;
  }
  if (!documentState.applyingDocument) {
    documentState.dirty = !update.state.doc.eq(documentState.saved);
    callbacks.updateTitle();
    callbacks.onChanges(update.changes, update.state);
  }
  callbacks.onDocumentChanged();
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

export type MergeEditorState = EditorState;
export type MergeTransactionSpec = TransactionSpec;

export interface MarkerMergeState {
  readonly expected: readonly string[];
  readonly left: string;
  readonly merge: MergeState;
  readonly right: string;
  readonly valid: readonly boolean[];
}

function conflictChunks(file: ConflictFile): readonly MergeChunk[] {
  return file.conflicts.map((conflict) => ({
    kind: "conflict",
    start: conflict.left.start,
    end: conflict.left.end,
    left: file.left.slice(conflict.left.start, conflict.left.end),
    right: file.right.slice(conflict.right.start, conflict.right.end),
  }));
}

export function createMarkerMergeState(text: string): MarkerMergeState | null {
  if (!text.includes("<<<<<<<")) return null;
  const parsed = parseConflictFile(text);
  if (!parsed.ok || parsed.file.conflicts.length === 0) return null;
  const chunks = conflictChunks(parsed.file);
  return {
    expected: chunks.map((chunk) => chunk.left),
    left: parsed.file.left,
    merge: createMergeState(chunks),
    right: parsed.file.right,
    valid: chunks.map(() => true),
  };
}

const setMarkerMerge = StateEffect.define<MarkerMergeState | null>();

function mappedMarkerMerge(
  state: MarkerMergeState,
  transaction: Transaction,
): MarkerMergeState {
  const chunks = state.merge.chunks.map((chunk) => ({
    ...chunk,
    start: transaction.changes.mapPos(chunk.start, 1),
    end: transaction.changes.mapPos(chunk.end, -1),
  }));
  const valid = chunks.map((chunk, index) => {
    const expected = state.expected[index];
    return expected !== undefined && chunk.start <= chunk.end &&
      transaction.newDoc.sliceString(chunk.start, chunk.end) === expected;
  });
  return { ...state, merge: { ...state.merge, chunks }, valid };
}

const markerMergeField = StateField.define<MarkerMergeState | null>({
  create: () => null,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setMarkerMerge)) return effect.value;
    }
    return value !== null && transaction.docChanged
      ? mappedMarkerMerge(value, transaction)
      : value;
  },
});

const invertMarkerMerge = invertedEffects.of((transaction) => {
  if (!transaction.effects.some((effect) => effect.is(setMarkerMerge))) return [];
  return [setMarkerMerge.of(transaction.startState.field(markerMergeField))];
});

export const markerMergeExtension: Extension = [markerMergeField, invertMarkerMerge];

export function markerMergeState(state: EditorState): MarkerMergeState | null {
  return state.field(markerMergeField, false) ?? null;
}

export function initializeMarkerMerge(
  state: EditorState,
  source: string,
  merge: MarkerMergeState,
): TransactionSpec | null {
  if (markerMergeState(state) !== null || state.doc.toString() !== source) return null;
  return {
    annotations: Transaction.addToHistory.of(false),
    changes: { from: 0, to: state.doc.length, insert: merge.left },
    effects: setMarkerMerge.of(merge),
  };
}

export function initializeThreeWayMerge(
  state: EditorState,
  source: string,
  merge: MarkerMergeState,
): TransactionSpec | null {
  if (markerMergeState(state) !== null || state.doc.toString() !== source) return null;
  return {
    annotations: Transaction.addToHistory.of(false),
    effects: setMarkerMerge.of(merge),
  };
}

function selectedMarkerEdit(
  state: EditorState,
  merge: MarkerMergeState,
  index: number,
  choice: ChunkChoice,
): TransactionSpec | null {
  const chunk = merge.merge.chunks[index];
  const expected = merge.expected[index];
  if (chunk === undefined || expected === undefined || merge.merge.resolved[index] ||
    !merge.valid[index] || state.doc.sliceString(chunk.start, chunk.end) !== expected) {
    return null;
  }
  const step = acceptChunk(merge.merge, index, choice);
  const edit = step.edits[0];
  if (edit === undefined) return null;
  const nextExpected = merge.expected.map((text, itemIndex) =>
    itemIndex === index ? edit.insert : text);
  return {
    changes: edit,
    effects: setMarkerMerge.of({
      ...merge,
      expected: nextExpected,
      merge: step.state,
    }),
  };
}

export function resolveMarkerConflict(
  state: EditorState,
  index: number,
  choice: ChunkChoice,
): TransactionSpec | null {
  const merge = markerMergeState(state);
  return merge === null ? null : selectedMarkerEdit(state, merge, index, choice);
}

export function applyMarkerChanges(state: EditorState): TransactionSpec | null {
  const merge = markerMergeState(state);
  if (merge === null) return null;
  const step = applyNonConflicting(merge.merge);
  if (step.edits.length === 0) return null;
  const expected = merge.expected.map((text, index) =>
    step.state.resolved[index] === true && merge.merge.resolved[index] !== true
      ? step.state.chunks[index]?.left ?? text
      : text);
  return {
    changes: step.edits,
    effects: setMarkerMerge.of({
      ...merge,
      expected,
      merge: step.state,
    }),
  };
}
