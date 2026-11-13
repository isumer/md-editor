import { invertedEffects } from "@codemirror/commands";
import {
  type EditorState,
  type Extension,
  StateEffect,
  StateField,
  Transaction,
  type TransactionSpec,
} from "@codemirror/state";

import {
  parseConflictFile,
  type ConflictFile,
} from "../../shared/merge/conflictMarkers";
import {
  acceptChunk,
  applyNonConflicting,
  createMergeState,
  mergeCounts,
  type ChunkChoice,
  type MergeChunk,
  type MergeCounts,
  type MergeState,
} from "../../shared/merge/mergeChunks";
import { ChunkPositions } from "./mergeChunkPositions";

export type MergeEditorState = EditorState;
export type MergeTransactionSpec = TransactionSpec;

export interface MarkerMergeState {
  readonly expected: readonly string[];
  readonly left: string;
  readonly merge: MergeState;
  readonly right: string;
}

export interface ActiveMarkerMergeState extends MarkerMergeState {
  readonly changed: readonly number[];
  readonly counts: MergeCounts;
  readonly invalid: ReadonlySet<number>;
  readonly positions: ChunkPositions;
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
  };
}

type MarkerMergeEffect =
  | {
    readonly changed: readonly number[];
    readonly kind: "replace";
    readonly value: ActiveMarkerMergeState | null;
  }
  | {
    readonly changed: readonly number[];
    readonly kind: "update";
    readonly source: ActiveMarkerMergeState;
    readonly value: MarkerMergeState;
  };

const setMarkerMerge = StateEffect.define<MarkerMergeEffect>();

function activeMarkerMerge(merge: MarkerMergeState): ActiveMarkerMergeState {
  return {
    ...merge,
    changed: merge.merge.chunks.map((_chunk, index) => index),
    counts: mergeCounts(merge.merge),
    invalid: new Set<number>(),
    positions: ChunkPositions.create(merge.merge.chunks),
  };
}

function updatedMergeCounts(
  state: ActiveMarkerMergeState,
  effect: Extract<MarkerMergeEffect, { readonly kind: "update" }>,
): MergeCounts {
  let changesLeft = state.counts.changesLeft;
  let conflictsLeft = state.counts.conflictsLeft;
  for (const index of effect.changed) {
    if (effect.value.merge.chunks[index]?.kind === "change") changesLeft -= 1;
    else conflictsLeft -= 1;
  }
  return { changesLeft, conflictsLeft };
}

function updatedMarkerMerge(
  state: ActiveMarkerMergeState,
  effect: Extract<MarkerMergeEffect, { readonly kind: "update" }>,
  transaction: Transaction,
): ActiveMarkerMergeState {
  const mapped = state.positions.map(transaction.changes);
  return {
    ...effect.value,
    changed: effect.changed,
    counts: updatedMergeCounts(state, effect),
    invalid: state.invalid,
    positions: mapped.positions,
  };
}

function mappedMarkerMerge(
  state: ActiveMarkerMergeState,
  transaction: Transaction,
): ActiveMarkerMergeState {
  const mapped = state.positions.map(transaction.changes);
  const invalid = new Set(state.invalid);
  for (const index of mapped.changed) {
    const position = mapped.positions.get(index);
    const expected = state.expected[index];
    const valid = position !== null && expected !== undefined &&
      position.start <= position.end &&
      transaction.newDoc.sliceString(position.start, position.end) === expected;
    if (valid) invalid.delete(index);
    else invalid.add(index);
  }
  return { ...state, changed: mapped.changed, invalid, positions: mapped.positions };
}

const markerMergeField = StateField.define<ActiveMarkerMergeState | null>({
  create: () => null,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (!effect.is(setMarkerMerge)) continue;
      return effect.value.kind === "replace"
        ? effect.value.value
        : updatedMarkerMerge(effect.value.source, effect.value, transaction);
    }
    return value !== null && transaction.docChanged
      ? mappedMarkerMerge(value, transaction)
      : value;
  },
});

const invertMarkerMerge = invertedEffects.of((transaction) => {
  const effect = transaction.effects.find((candidate) => candidate.is(setMarkerMerge));
  if (effect === undefined) return [];
  return [setMarkerMerge.of({
    changed: effect.value.changed,
    kind: "replace",
    value: transaction.startState.field(markerMergeField),
  })];
});

export const markerMergeExtension: Extension = [markerMergeField, invertMarkerMerge];

export function markerMergeState(state: EditorState): ActiveMarkerMergeState | null {
  return state.field(markerMergeField, false) ?? null;
}

export function markerChunkIsValid(merge: ActiveMarkerMergeState, index: number): boolean {
  return !merge.invalid.has(index);
}

export function positionedMarkerMerge(merge: ActiveMarkerMergeState): MergeState {
  return {
    ...merge.merge,
    chunks: merge.merge.chunks.map((chunk, index) => {
      const position = merge.positions.getKnown(index);
      return { ...chunk, ...position };
    }),
  };
}

function initialMergeEffect(merge: MarkerMergeState): MarkerMergeEffect {
  return {
    changed: merge.merge.chunks.map((_chunk, index) => index),
    kind: "replace",
    value: activeMarkerMerge(merge),
  };
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
    effects: setMarkerMerge.of(initialMergeEffect(merge)),
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
    effects: setMarkerMerge.of(initialMergeEffect(merge)),
  };
}

function selectedMarkerEdit(
  state: EditorState,
  merge: ActiveMarkerMergeState,
  index: number,
  choice: ChunkChoice,
): TransactionSpec | null {
  const chunk = merge.merge.chunks[index];
  const position = merge.positions.getKnown(index);
  const expected = merge.expected[index];
  if (chunk === undefined || expected === undefined ||
    merge.merge.resolved[index] || !markerChunkIsValid(merge, index) ||
    state.doc.sliceString(position.start, position.end) !== expected) return null;
  const step = acceptChunk(positionedMarkerMerge(merge), index, choice);
  const insert = choice === "left" ? chunk.left
    : choice === "right" ? chunk.right : chunk.left + chunk.right;
  const nextExpected = merge.expected.map((text, itemIndex) =>
    itemIndex === index ? insert : text);
  return {
    changes: step.edits,
    effects: setMarkerMerge.of({
      changed: [index],
      kind: "update",
      source: merge,
      value: { ...merge, expected: nextExpected, merge: step.state },
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
  const step = applyNonConflicting(positionedMarkerMerge(merge));
  if (step.edits.length === 0) return null;
  const expected = merge.expected.map((text, index) =>
    step.state.resolved[index] === true && merge.merge.resolved[index] !== true
      ? step.state.chunks[index]?.left ?? text
      : text);
  return {
    changes: step.edits,
    effects: setMarkerMerge.of({
      changed: step.state.resolved.flatMap((resolved, index) =>
        resolved && !merge.merge.resolved[index] ? [index] : []),
      kind: "update",
      source: merge,
      value: { ...merge, expected, merge: step.state },
    }),
  };
}
