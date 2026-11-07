import { describe, expect, it } from 'vitest';
import {
  acceptChunk,
  applyNonConflicting,
  createMergeState,
  mergeCounts,
  nextChunk,
  previousChunk,
  type MergeChunk,
  type TextEdit,
} from '../../src/shared/merge/mergeChunks';

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  for (const edit of [...edits].reverse()) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

describe('merge chunks', () => {
  it('AC-R15-04: accepting left puts the left text in the centre', () => {
    const state = createMergeState([
      { kind: 'conflict', start: 2, end: 5, left: 'LEFT', right: 'RIGHT' },
    ]);

    const step = acceptChunk(state, 0, 'left');

    expect(applyEdits('a old z', step.edits)).toBe('a LEFT z');
  });

  it('AC-R15-04: accepting both puts left then right', () => {
    const state = createMergeState([
      { kind: 'conflict', start: 2, end: 5, left: 'LEFT', right: 'RIGHT' },
    ]);

    const step = acceptChunk(state, 0, 'both');

    expect(applyEdits('a old z', step.edits)).toBe('a LEFTRIGHT z');
  });

  it('AC-R15-04: accepting a chunk shifts the later chunks', () => {
    const initial = 'a x b y c';
    const state = createMergeState([
      { kind: 'conflict', start: 2, end: 3, left: 'long', right: 'L' },
      { kind: 'conflict', start: 6, end: 7, left: 'second', right: 'R' },
    ]);

    const first = acceptChunk(state, 0, 'left');
    const afterFirst = applyEdits(initial, first.edits);
    const second = acceptChunk(first.state, 1, 'left');

    expect(applyEdits(afterFirst, second.edits)).toBe('a long b second c');
  });

  it('AC-R15-04: a resolved chunk cannot be accepted again', () => {
    const state = createMergeState([
      { kind: 'conflict', start: 0, end: 1, left: 'a', right: 'b' },
    ]);
    const resolved = acceptChunk(state, 0, 'right').state;

    expect(() => acceptChunk(resolved, 0, 'left')).toThrow(RangeError);
  });

  it('AC-R15-04: the counter drops after an accept', () => {
    const state = createMergeState([
      { kind: 'change', start: 0, end: 1, left: 'a', right: 'a' },
      { kind: 'conflict', start: 2, end: 3, left: 'b', right: 'c' },
    ]);

    const step = acceptChunk(state, 1, 'left');

    expect(mergeCounts(step.state)).toEqual({ changesLeft: 1, conflictsLeft: 0 });
  });

  it('AC-R15-05: applying non-conflicting changes is one step', () => {
    const centre = '0a1b2c3d4e5f6';
    const state = createMergeState([
      { kind: 'change', start: 1, end: 2, left: 'AA', right: 'AA' },
      { kind: 'conflict', start: 3, end: 4, left: 'B', right: 'bb' },
      { kind: 'change', start: 5, end: 6, left: '', right: '' },
      { kind: 'change', start: 7, end: 8, left: 'DDD', right: 'DDD' },
      { kind: 'conflict', start: 9, end: 10, left: 'E', right: 'ee' },
      { kind: 'change', start: 11, end: 12, left: 'FF', right: 'FF' },
      { kind: 'change', start: 13, end: 13, left: 'G', right: 'G' },
    ]);

    const step = applyNonConflicting(state);

    expect(step.edits).toHaveLength(5);
    expect(applyEdits(centre, step.edits)).toBe('0AA1b23DDD4e5FF6G');
    expect(mergeCounts(step.state)).toEqual({ changesLeft: 0, conflictsLeft: 2 });
  });

  it('AC-R15-05: applying with no change left returns no edits', () => {
    const state = createMergeState([
      { kind: 'conflict', start: 0, end: 1, left: 'a', right: 'b' },
    ]);

    const step = applyNonConflicting(state);

    expect(step.state).toBe(state);
    expect(step.edits).toEqual([]);
  });

  it('AC-R15-10: next and previous skip resolved chunks and the other kind', () => {
    const state = createMergeState([
      { kind: 'change', start: 1, end: 2, left: 'a', right: 'a' },
      { kind: 'conflict', start: 3, end: 4, left: 'b', right: 'c' },
      { kind: 'change', start: 5, end: 6, left: 'd', right: 'd' },
      { kind: 'conflict', start: 7, end: 8, left: 'e', right: 'f' },
    ]);
    const resolved = acceptChunk(state, 1, 'left').state;

    expect(nextChunk(resolved, 1, 'conflict')).toBe(3);
    expect(previousChunk(resolved, 8, 'conflict')).toBe(3);
    expect(nextChunk(resolved, 1, 'change')).toBe(2);
    expect(previousChunk(resolved, 7, 'change')).toBe(2);
  });

  it('AC-R15-10: navigation returns null past the last chunk', () => {
    const state = createMergeState([
      { kind: 'change', start: 2, end: 3, left: 'a', right: 'a' },
    ]);

    expect(nextChunk(state, 2, 'change')).toBeNull();
    expect(previousChunk(state, 2, 'change')).toBeNull();
    expect(nextChunk(state, 10, 'conflict')).toBeNull();
    expect(previousChunk(state, -1, 'conflict')).toBeNull();
  });

  it('AC-R15-04: rejects overlapping, negative and fractional ranges', () => {
    expect(() =>
      createMergeState([
        { kind: 'change', start: 1, end: 3, left: '', right: '' },
        { kind: 'change', start: 2, end: 4, left: '', right: '' },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      createMergeState([
        { kind: 'change', start: -1, end: 0, left: '', right: '' },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      createMergeState([
        { kind: 'change', start: 0.5, end: 1, left: '', right: '' },
      ]),
    ).toThrow(RangeError);
  });

  it('AC-R15-04: rejects an index out of range', () => {
    const state = createMergeState([
      { kind: 'change', start: 0, end: 1, left: 'a', right: 'a' },
    ]);

    expect(() => acceptChunk(state, -1, 'left')).toThrow(RangeError);
    expect(() => acceptChunk(state, 1, 'left')).toThrow(RangeError);
    expect(() => acceptChunk(state, 0.5, 'left')).toThrow(RangeError);
  });

  it('AC-R15-04: does not change its arguments', () => {
    const chunks: readonly MergeChunk[] = Object.freeze([
      Object.freeze({
        kind: 'change' as const,
        start: 0,
        end: 1,
        left: 'long',
        right: 'long',
      }),
      Object.freeze({
        kind: 'conflict' as const,
        start: 2,
        end: 3,
        left: 'b',
        right: 'c',
      }),
    ]);
    const state = createMergeState(chunks);
    Object.freeze(state.chunks);
    for (const chunk of state.chunks) Object.freeze(chunk);
    Object.freeze(state.resolved);
    Object.freeze(state);

    expect(() => acceptChunk(state, 0, 'left')).not.toThrow();
    expect(() => applyNonConflicting(state)).not.toThrow();
    expect(chunks).toEqual([
      { kind: 'change', start: 0, end: 1, left: 'long', right: 'long' },
      { kind: 'conflict', start: 2, end: 3, left: 'b', right: 'c' },
    ]);
    expect(state.resolved).toEqual([false, false]);
  });
});
