import { describe, expect, it } from 'vitest';
import { parseConflictFile } from '../../src/shared/merge/conflictMarkers';

describe('conflict markers', () => {
  it('AC-R15-06: splits one block into two sides', () => {
    const text =
      'before\n<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs\nafter\n';

    expect(parseConflictFile(text)).toEqual({
      ok: true,
      file: {
        left: 'before\nleft\nafter\n',
        right: 'before\nright\nafter\n',
        conflicts: [
          {
            left: { start: 7, end: 12 },
            right: { start: 7, end: 13 },
          },
        ],
      },
    });
  });

  it('AC-R15-06: keeps text outside the blocks on both sides', () => {
    const text = 'alpha\n<<<<<<<\nleft\n=======\nright\n>>>>>>>\nomega';

    const result = parseConflictFile(text);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.left).toBe('alpha\nleft\nomega');
      expect(result.file.right).toBe('alpha\nright\nomega');
    }
  });

  it('AC-R15-06: reports two blocks in document order', () => {
    const text =
      'a\n<<<<<<<\nL1\n=======\nR1\n>>>>>>>\nb\n<<<<<<<\nleft two\n=======\nright two\n>>>>>>>\nc\n';

    expect(parseConflictFile(text)).toEqual({
      ok: true,
      file: {
        left: 'a\nL1\nb\nleft two\nc\n',
        right: 'a\nR1\nb\nright two\nc\n',
        conflicts: [
          {
            left: { start: 2, end: 5 },
            right: { start: 2, end: 5 },
          },
          {
            left: { start: 7, end: 16 },
            right: { start: 7, end: 17 },
          },
        ],
      },
    });
  });

  it('AC-R15-06: accepts CRLF line endings and keeps them', () => {
    const text =
      'before\r\n<<<<<<< ours\r\nleft\r\n=======\r\nright\r\n>>>>>>> theirs\r\nafter\r\n';

    const result = parseConflictFile(text);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.left).toBe('before\r\nleft\r\nafter\r\n');
      expect(result.file.right).toBe('before\r\nright\r\nafter\r\n');
    }
  });

  it('AC-R15-06: ignores the labels after the markers', () => {
    const text =
      '<<<<<<< branch-a with label\nleft\n=======\nright\n>>>>>>> branch-b with label\n';

    const result = parseConflictFile(text);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.left).toBe('left\n');
      expect(result.file.right).toBe('right\n');
    }
  });

  it('AC-R15-06: accepts an empty side', () => {
    const text = 'pre\n<<<<<<< ours\n=======\nright\n>>>>>>> theirs\n';

    expect(parseConflictFile(text)).toEqual({
      ok: true,
      file: {
        left: 'pre\n',
        right: 'pre\nright\n',
        conflicts: [
          {
            left: { start: 4, end: 4 },
            right: { start: 4, end: 10 },
          },
        ],
      },
    });
  });

  it('AC-R15-06: uses UTF-16 offsets for conflict ranges', () => {
    const text =
      '\u{1f600}\n<<<<<<<\n\u{1f98a}\n=======\n\u{1f680}\n>>>>>>>\n';

    expect(parseConflictFile(text)).toEqual({
      ok: true,
      file: {
        left: '\u{1f600}\n\u{1f98a}\n',
        right: '\u{1f600}\n\u{1f680}\n',
        conflicts: [
          {
            left: { start: 3, end: 6 },
            right: { start: 3, end: 6 },
          },
        ],
      },
    });
  });

  it('AC-R15-06: treats a labelled separator as content', () => {
    const text =
      '<<<<<<< ours\nleft\n======= label\nright\n>>>>>>> theirs\n';

    expect(parseConflictFile(text)).toEqual({
      ok: false,
      reason: 'start-without-separator',
    });
  });

  it('AC-R15-06: reports an end marker before the separator', () => {
    const text = '<<<<<<<\nleft\n>>>>>>>\n=======\nright\n>>>>>>>\n';

    expect(parseConflictFile(text)).toEqual({
      ok: false,
      reason: 'start-without-separator',
    });
  });

  it('AC-R15-06: reports a nested start marker after the separator', () => {
    const text =
      '<<<<<<<\nleft\n=======\nright\n<<<<<<< nested\nnested left\n=======\nnested right\n>>>>>>>\n>>>>>>>\n';

    expect(parseConflictFile(text)).toEqual({
      ok: false,
      reason: 'start-without-end',
    });
  });

  it('AC-R15-06: reports a start marker with no separator', () => {
    const text = 'before\n<<<<<<< ours\nleft\n';

    expect(parseConflictFile(text)).toEqual({
      ok: false,
      reason: 'start-without-separator',
    });
  });

  it('AC-R15-06: reports a start marker with no end marker', () => {
    const text = 'before\n<<<<<<< ours\nleft\n=======\nright\n';

    expect(parseConflictFile(text)).toEqual({
      ok: false,
      reason: 'start-without-end',
    });
  });

  it('AC-R15-06: reports a separator outside a block', () => {
    expect(parseConflictFile('before\n=======\nafter\n')).toEqual({
      ok: false,
      reason: 'separator-outside-block',
    });
  });

  it('AC-R15-06: reports an end marker outside a block', () => {
    expect(parseConflictFile('before\n>>>>>>> theirs\nafter\n')).toEqual({
      ok: false,
      reason: 'end-outside-block',
    });
  });

  it('AC-R15-06: does not change the input', () => {
    const text = Object.freeze('<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs\n');
    const original = text.slice();

    parseConflictFile(text);

    expect(text).toBe(original);
  });
});
