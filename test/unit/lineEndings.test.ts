import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectLineEnding, applyLineEnding, type LineEnding } from '../../src/shared/text/lineEndings';

describe('AC-R12-03: line endings', () => {
  it('detects the fixture line endings', () => {
    const crlfTxt = readFileSync('test/fixtures/encodings/crlf.txt', 'utf-8');
    expect(detectLineEnding(crlfTxt)).toBe('crlf');

    const goldenCrlf = readFileSync('test/fixtures/golden/crlf-line-endings.md', 'utf-8');
    expect(detectLineEnding(goldenCrlf)).toBe('crlf');
  });

  it('detects each single kind', () => {
    expect(detectLineEnding('a\nb\n')).toBe('lf');
    expect(detectLineEnding('a\r\nb\r\n')).toBe('crlf');
    expect(detectLineEnding('a\rb\r')).toBe('cr');
  });

  it('takes the most frequent kind', () => {
    expect(detectLineEnding('a\r\nb\r\nc\n')).toBe('crlf');
  });

  it('breaks a tie by the first occurrence', () => {
    expect(detectLineEnding('a\r\nb\n')).toBe('crlf');
    expect(detectLineEnding('a\nb\r\n')).toBe('lf');
  });

  it('reports no kind without a break', () => {
    expect(detectLineEnding('')).toBeUndefined();
    expect(detectLineEnding('abc')).toBeUndefined();
  });

  it('applies a kind to every break', () => {
    expect(applyLineEnding('a\nb\r\nc', 'crlf')).toBe('a\r\nb\r\nc');
    expect(applyLineEnding('a\r\nb', 'lf')).toBe('a\nb');
    expect(applyLineEnding('a\nb', 'cr')).toBe('a\rb');
  });

  it('keeps a final line break', () => {
    expect(applyLineEnding('a\nb\n', 'crlf')).toBe('a\r\nb\r\n');
    expect(applyLineEnding('a\nb', 'crlf')).toBe('a\r\nb');
  });

  it('leaves text without a break unchanged', () => {
    expect(applyLineEnding('', 'crlf')).toBe('');
    expect(applyLineEnding('abc', 'crlf')).toBe('abc');
  });

  it('is idempotent', () => {
    const once = applyLineEnding('a\nb\n', 'crlf');
    const twice = applyLineEnding(once, 'crlf');
    expect(twice).toBe(once);
  });

  it('round-trips the CRLF fixture', () => {
    const crlfTxt = readFileSync('test/fixtures/encodings/crlf.txt', 'utf-8');
    const roundTrip = applyLineEnding(crlfTxt, 'crlf');
    expect(roundTrip).toBe(crlfTxt);
    expect(Buffer.byteLength(roundTrip, 'utf-8')).toBe(20);
  });
});