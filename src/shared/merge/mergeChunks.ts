export type ChunkKind = 'change' | 'conflict';
export type ChunkChoice = 'left' | 'right' | 'both';

export interface MergeChunk {
  readonly kind: ChunkKind;
  readonly start: number;
  readonly end: number;
  readonly left: string;
  readonly right: string;
}

export interface TextEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface MergeState {
  readonly chunks: readonly MergeChunk[];
  readonly resolved: readonly boolean[];
}

export interface MergeStep {
  readonly state: MergeState;
  readonly edits: readonly TextEdit[];
}

export interface MergeCounts {
  readonly changesLeft: number;
  readonly conflictsLeft: number;
}

function isValidRange(chunk: MergeChunk, previousEnd: number): boolean {
  return (
    Number.isInteger(chunk.start) &&
    Number.isInteger(chunk.end) &&
    chunk.start >= 0 &&
    chunk.start <= chunk.end &&
    chunk.start >= previousEnd
  );
}

export function createMergeState(chunks: readonly MergeChunk[]): MergeState {
  let previousEnd = 0;
  for (const chunk of chunks) {
    if (!isValidRange(chunk, previousEnd)) {
      throw new RangeError('Merge chunks must have ordered integer ranges');
    }
    previousEnd = chunk.end;
  }
  return {
    chunks: chunks.map((chunk) => ({ ...chunk })),
    resolved: chunks.map(() => false),
  };
}

function selectedText(chunk: MergeChunk, choice: ChunkChoice): string {
  if (choice === 'left') return chunk.left;
  if (choice === 'right') return chunk.right;
  return chunk.left + chunk.right;
}

function shiftedChunk(chunk: MergeChunk, delta: number): MergeChunk {
  return { ...chunk, start: chunk.start + delta, end: chunk.end + delta };
}

export function acceptChunk(
  state: MergeState,
  index: number,
  choice: ChunkChoice,
): MergeStep {
  const chunk = state.chunks[index];
  if (!Number.isInteger(index) || chunk === undefined || state.resolved[index]) {
    throw new RangeError('Merge chunk index must identify an unresolved chunk');
  }
  const insert = selectedText(chunk, choice);
  const delta = insert.length - (chunk.end - chunk.start);
  const chunks = state.chunks.map((item, itemIndex) => {
    if (itemIndex === index) {
      return { ...item, end: item.start + insert.length };
    }
    return itemIndex > index ? shiftedChunk(item, delta) : item;
  });
  const resolved = state.resolved.map((value, itemIndex) =>
    itemIndex === index ? true : value,
  );
  return {
    state: { chunks, resolved },
    edits: [{ from: chunk.start, to: chunk.end, insert }],
  };
}

export function applyNonConflicting(state: MergeState): MergeStep {
  const edits: TextEdit[] = [];
  const resolved = [...state.resolved];
  let shift = 0;
  const chunks = state.chunks.map((chunk, index) => {
    const start = chunk.start + shift;
    if (chunk.kind !== 'change' || state.resolved[index]) {
      return { ...chunk, start, end: chunk.end + shift };
    }
    edits.push({ from: chunk.start, to: chunk.end, insert: chunk.left });
    resolved[index] = true;
    shift += chunk.left.length - (chunk.end - chunk.start);
    return { ...chunk, start, end: start + chunk.left.length };
  });
  if (edits.length === 0) return { state, edits };
  return { state: { chunks, resolved }, edits };
}

export function mergeCounts(state: MergeState): MergeCounts {
  let changesLeft = 0;
  let conflictsLeft = 0;
  state.chunks.forEach((chunk, index) => {
    if (state.resolved[index]) return;
    if (chunk.kind === 'change') changesLeft += 1;
    else conflictsLeft += 1;
  });
  return { changesLeft, conflictsLeft };
}

export function nextChunk(
  state: MergeState,
  offset: number,
  kind: ChunkKind,
): number | null {
  for (let index = 0; index < state.chunks.length; index += 1) {
    const chunk = state.chunks[index];
    if (chunk !== undefined && !state.resolved[index] && chunk.kind === kind) {
      if (chunk.start > offset) return index;
    }
  }
  return null;
}

export function previousChunk(
  state: MergeState,
  offset: number,
  kind: ChunkKind,
): number | null {
  for (let index = state.chunks.length - 1; index >= 0; index -= 1) {
    const chunk = state.chunks[index];
    if (chunk !== undefined && !state.resolved[index] && chunk.kind === kind) {
      if (chunk.start < offset) return index;
    }
  }
  return null;
}
