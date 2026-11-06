import { describe, it, expect } from 'vitest';
import {
  insertNumbersAtColumn,
  insertTextAtColumn,
} from '../../src/shared/lines/columnEditor';

describe('AC-R13-03: column editor', () => {
  it('AC-R13-03: inserts text at the column on every line of the range', () => {
    const result = insertTextAtColumn(['aa', 'bb', 'cc'], 0, 1, 2, 'X');

    expect(result).toEqual(['aXa', 'bXb', 'cc']);
  });

  it('AC-R13-03: pads a short line with spaces', () => {
    const result = insertTextAtColumn(['a', 'abc'], 0, 1, 4, 'Z');

    expect(result).toEqual(['a  Z', 'abcZ']);
  });

  it('AC-R13-03: inserts an increasing number', () => {
    const result = insertNumbersAtColumn(['', '', ''], 0, 2, 1, 1, 1);

    expect(result).toEqual(['1', '2', '3']);
  });

  it('AC-R13-03: inserts a decreasing number', () => {
    const result = insertNumbersAtColumn(['', ''], 0, 1, 1, 10, -4);

    expect(result).toEqual(['10', '6']);
  });

  it('AC-R13-03: counts columns in code units and never splits a surrogate pair', () => {
    const result = insertTextAtColumn(['\u{1F600}x'], 0, 0, 2, 'Z');

    expect(result).toEqual(['Z\u{1F600}x']);
  });

  it('AC-R13-03: never splits the lowest and highest supplementary characters', () => {
    const result = insertTextAtColumn(['\u{10000}', '\u{10FFFF}'], 0, 1, 2, 'Z');

    expect(result).toEqual(['Z\u{10000}', 'Z\u{10FFFF}']);
  });

  it('AC-R13-03: clamps a range past the end of the lines', () => {
    const result = insertTextAtColumn(['a', 'b', 'c'], 1, 99, 1, 'X');

    expect(result).toEqual(['a', 'Xb', 'Xc']);
  });

  it('AC-R13-03: returns a copy when the range is empty', () => {
    const lines = ['a', 'b', 'c'];

    const result = insertTextAtColumn(lines, 2, 1, 1, 'X');

    expect(result).toEqual(lines);
    expect(result).not.toBe(lines);
  });

  it('AC-R13-03: throws RangeError for an invalid column', () => {
    expect(() => insertTextAtColumn(['a'], 0, 0, 0, 'X')).toThrow(RangeError);
    expect(() => insertTextAtColumn(['a'], 0, 0, 1.5, 'X')).toThrow(RangeError);
  });

  it('AC-R13-03: throws RangeError for an invalid line number', () => {
    expect(() => insertTextAtColumn(['a'], 0.5, 0, 1, 'X')).toThrow(RangeError);
  });

  it('AC-R13-03: throws RangeError for a non-integer endLine', () => {
    expect(() => insertTextAtColumn(['a'], 0, 0.5, 1, 'X')).toThrow(RangeError);
    expect(() => insertNumbersAtColumn(['a'], 0, 0.5, 1, 1, 1)).toThrow(RangeError);
  });

  it('AC-R13-03: throws RangeError for a non-safe-integer first or step', () => {
    expect(() => insertNumbersAtColumn(['a'], 0, 0, 1, 0.5, 1)).toThrow(RangeError);
    expect(() => insertNumbersAtColumn(['a'], 0, 0, 1, 1, 0.5)).toThrow(RangeError);
  });

  it('AC-R13-03: rejects invalid arguments in the number inserter', () => {
    expect(() => insertNumbersAtColumn(['a'], 0, 0, 0, 1, 1)).toThrow(RangeError);
    expect(() => insertNumbersAtColumn(['a'], 0.5, 0, 1, 1, 1)).toThrow(RangeError);
  });

  it('AC-R13-03: numbers count from the first line of the range', () => {
    const result = insertNumbersAtColumn(['a', 'b', 'c'], 1, 2, 1, 5, 2);

    expect(result).toEqual(['a', '5b', '7c']);
  });

  it('AC-R13-03: clamps a start past the end of the lines', () => {
    const result = insertTextAtColumn(['a', 'b', 'c'], 99, 99, 1, 'X');

    expect(result).toEqual(['a', 'b', 'Xc']);
  });

  it('AC-R13-03: never changes the input', () => {
    const lines = Object.freeze(['aa', 'bb']);

    const textResult = insertTextAtColumn(lines, 0, 1, 1, 'X');
    const numberResult = insertNumbersAtColumn(lines, 0, 1, 1, 1, 1);

    expect(lines).toEqual(['aa', 'bb']);
    expect(textResult).toEqual(['Xaa', 'Xbb']);
    expect(numberResult).toEqual(['1aa', '2bb']);
  });
});
