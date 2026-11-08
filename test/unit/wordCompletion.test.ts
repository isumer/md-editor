import { describe, it, expect } from 'vitest';
import { wordAt, completeWord } from '../../src/shared/text/wordCompletion';

describe('AC-R13-04: word completion', () => {
  describe('wordAt', () => {
    it('AC-R13-04: finds the word before the cursor', () => {
      const text = 'hello world';
      expect(wordAt(text, 1)).toEqual({ prefix: 'h', start: 0 });
      expect(wordAt(text, 5)).toEqual({ prefix: 'hello', start: 0 });
      expect(wordAt(text, 3)).toEqual({ prefix: 'hel', start: 0 });
      expect(wordAt(text, 11)).toEqual({ prefix: 'world', start: 6 });
    });

    it('AC-R13-04: returns an empty prefix at a non-word character', () => {
      const text = 'hello world';
      expect(wordAt(text, 0)).toEqual({ prefix: '', start: 0 });
      expect(wordAt(text, 6)).toEqual({ prefix: '', start: 6 }); // space at index 5, cursor at 6
      expect(wordAt(text, 5)).toEqual({ prefix: 'hello', start: 0 }); // cursor after 'o', word char before
    });

    it('AC-R13-04: clamps offsets outside the text', () => {
      const text = 'hello';
      expect(wordAt(text, -1)).toEqual({ prefix: '', start: 0 });
      expect(wordAt(text, -10)).toEqual({ prefix: '', start: 0 });
      expect(wordAt(text, 5)).toEqual({ prefix: 'hello', start: 0 });
      expect(wordAt(text, 10)).toEqual({ prefix: 'hello', start: 0 });
    });

    it('AC-R13-04: handles non-BMP letters', () => {
      expect(wordAt('a𐐀b', 3)).toEqual({ prefix: 'a𐐀', start: 0 });
      expect(wordAt('𐐀b', 1)).toEqual({ prefix: '', start: 0 });
      expect(completeWord('𐐀𐐨x 𐐀𐐨xyz', 5)).toEqual(['𐐀𐐨xyz']);
    });
  });

  describe('completeWord', () => {
    it('AC-R13-04: suggests words that start with the prefix', () => {
      const text = 'help hello helium world';
      // cursor at offset 3 in "help", prefix "hel", cursor word "help" excluded
      // "hello" (len 5 > 3) and "helium" (len 6 > 3) match
      expect(completeWord(text, 3)).toEqual(['hello', 'helium']);
    });

    it('AC-R13-04: matches case-insensitively and keeps the first spelling', () => {
      const text = 'Hello hello HELLO';
      // cursor in "Hello" at offset 3, prefix "Hel"
      // "hello" at index 6 is first candidate (case-insensitive dedup keeps first spelling "hello")
      expect(completeWord(text, 3)).toEqual(['hello']);
    });

    it('AC-R13-04: returns each word once', () => {
      const text = 'help help help';
      expect(completeWord(text, 2)).toEqual(['help']);
    });

    it('AC-R13-04: keeps document order and the limit', () => {
      const text = 'apple applet application apricot approach append banana';
      expect(completeWord(text, 3, 3)).toEqual([
        'applet',
        'application',
        'apricot',
      ]);
    });

    it('AC-R13-04: defaults to at most 20 words', () => {
      const text = `ite ${Array.from({ length: 21 }, (_, index) => `item${index}`).join(' ')}`;
      const results = completeWord(text, 3);
      expect(results).toHaveLength(20);
      expect(results.at(-1)).toBe('item19');
      expect(results).not.toContain('item20');
    });

    it('AC-R13-04: ignores the word at the cursor', () => {
      const text = 'hello world';
      // cursor at end of "hello" - the word being typed is "hello"
      expect(completeWord(text, 5)).toEqual([]);
    });

    it('AC-R13-04: needs at least two characters', () => {
      const text = 'hello world';
      expect(completeWord(text, 1)).toEqual([]);
    });

    it('AC-R13-04: needs at least two characters when another word matches', () => {
      const text = 'h hello';
      // the one-character prefix "h" matches "hello" at offset 4; rule 3 still refuses it
      expect(completeWord(text, 1)).toEqual([]);
    });

    it('AC-R13-04: does not suggest a word no longer than the prefix', () => {
      const text = 'hello Hello hell';
      // cursor after the first "hello"; the later "Hello" is equal and "hell" is shorter
      expect(completeWord(text, 5)).toEqual([]);
    });

    it('AC-R13-04: treats a zero limit as no words', () => {
      const text = 'hello world helium help';
      expect(completeWord(text, 3, 0)).toEqual([]);
      expect(completeWord(text, 3, -1)).toEqual([]);
    });

    it('AC-R13-04: handles Unicode letters', () => {
      const text = 'Ärztin Ärger';
      // cursor at offset 2 in "Ärztin", prefix "Är"
      expect(completeWord(text, 2)).toEqual(['Ärger']);
    });
  });
});
