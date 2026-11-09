import {
  parseConflictFile,
  type ConflictFile,
} from "../../../shared/merge/conflictMarkers";
import {
  acceptChunk,
  createMergeState,
  type ChunkChoice,
  type MergeChunk,
  type MergeState,
  type TextEdit,
} from "../../../shared/merge/mergeChunks";

interface MergeSnapshot {
  readonly merge: MergeState;
  readonly text: string;
}

export interface MarkerMergeState extends MergeSnapshot {
  readonly left: string;
  readonly right: string;
  readonly history: readonly MergeSnapshot[];
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

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  for (const edit of [...edits].reverse()) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

export function createMarkerMergeState(text: string): MarkerMergeState | null {
  const parsed = parseConflictFile(text);
  if (!parsed.ok || parsed.file.conflicts.length === 0) {
    return null;
  }
  return {
    left: parsed.file.left,
    right: parsed.file.right,
    text: parsed.file.left,
    merge: createMergeState(conflictChunks(parsed.file)),
    history: [],
  };
}

export function resolveMarkerConflict(
  state: MarkerMergeState,
  index: number,
  choice: ChunkChoice,
): MarkerMergeState {
  const step = acceptChunk(state.merge, index, choice);
  return {
    ...state,
    text: applyEdits(state.text, step.edits),
    merge: step.state,
    history: [...state.history, { merge: state.merge, text: state.text }],
  };
}

export function undoMarkerConflict(state: MarkerMergeState): MarkerMergeState {
  const previous = state.history.at(-1);
  if (previous === undefined) {
    return state;
  }
  return {
    ...state,
    ...previous,
    history: state.history.slice(0, -1),
  };
}
