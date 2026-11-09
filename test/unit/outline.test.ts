import { describe, it, expect } from 'vitest';
import { outlineHeadings } from '../../src/shared/outline/outline';
import type { OutlineEntry } from '../../src/shared/outline/outline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturePath = join(__dirname, '../fixtures/outline/outline.md');
const fixture = readFileSync(fixturePath, 'utf-8');

describe('AC-R13-01: outlineHeadings', () => {
  it('lists the fixture outline', () => {
    const entries = outlineHeadings(fixture);
    const expected: OutlineEntry[] = [
      { level: 1, text: 'Outline fixture', line: 1 },
      { level: 2, text: 'Closed heading', line: 5 },
      { level: 3, text: 'Heading with `inline code`', line: 9 },
      { level: 4, text: 'Level four heading', line: 13 },
      { level: 1, text: 'Setext heading', line: 17 },
      { level: 2, text: 'Duplicate heading', line: 22 },
      { level: 2, text: 'Duplicate heading', line: 26 },
      { level: 3, text: 'Türkçe başlık', line: 30 },
      { level: 2, text: 'Fenced block', line: 34 },
    ];
    expect(entries).toEqual(expected);
  });

  it('keeps inline code and Unicode', () => {
    const entries = outlineHeadings(fixture);
    const inlineCodeEntry = entries.find(e => e.text.includes('inline code'));
    expect(inlineCodeEntry).toBeDefined();
    expect(inlineCodeEntry?.text).toBe('Heading with `inline code`');
    const unicodeEntry = entries.find(e => e.text === 'Türkçe başlık');
    expect(unicodeEntry).toBeDefined();
    expect(unicodeEntry?.line).toBe(30);
    expect(unicodeEntry?.level).toBe(3);
  });

  it('ignores a heading inside a fenced block', () => {
    const entries = outlineHeadings(fixture);
    const fencedHeading = entries.find(e => e.text === 'not a heading');
    expect(fencedHeading).toBeUndefined();
  });

  it('reads setext headings', () => {
    const markdown = 'Setext level 1\n==============\n\nSetext level 2\n--------------\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([
      { level: 1, text: 'Setext level 1', line: 1 },
      { level: 2, text: 'Setext level 2', line: 4 },
    ]);
  });

  it('removes a closing hash run', () => {
    const markdown = '## Title ##\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 2, text: 'Title', line: 1 }]);
  });

  it('ignores a hash run without a space', () => {
    const markdown = '#tag\n#######\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('handles tilde fences', () => {
    const markdown = '~~~text\n# not a heading\n~~~\n# Real heading\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 1, text: 'Real heading', line: 4 }]);
  });

  it('skips empty heading text', () => {
    const markdown = '##  ##\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('ignores atx heading with no text', () => {
    const markdown = '#\n##\n###\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('reads setext with leading spaces on underline', () => {
    const markdown = 'Setext heading\n   ==========\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 1, text: 'Setext heading', line: 1 }]);
  });

  it('handles multiple fenced blocks', () => {
    const markdown = '```js\n# code\n```\n# Heading 1\n~~~\n# code again\n~~~\n# Heading 2\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([
      { level: 1, text: 'Heading 1', line: 4 },
      { level: 1, text: 'Heading 2', line: 8 },
    ]);
  });

  it('ignores unclosed fenced block until end', () => {
    const markdown = '```\n# not heading\n# not heading\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('handles setext with dash underline', () => {
    const markdown = 'Setext level 2\n   ----------\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 2, text: 'Setext level 2', line: 1 }]);
  });

  it('ignores atx with only spaces before hash', () => {
    const markdown = '   # heading\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 1, text: 'heading', line: 1 }]);
  });

  it('handles empty lines between headings', () => {
    const markdown = '# Heading 1\n\n\n## Heading 2\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([
      { level: 1, text: 'Heading 1', line: 1 },
      { level: 2, text: 'Heading 2', line: 4 },
    ]);
  });

  it('does not open a fence indented four spaces', () => {
    const markdown = '    ```\n# Real heading\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([{ level: 1, text: 'Real heading', line: 2 }]);
  });

  it('does not close a fence on a line with an info string', () => {
    const markdown = '```js\ncode\n```js\n# inside\n```\n# after\n';
    expect(outlineHeadings(markdown)).toEqual([{ level: 1, text: 'after', line: 6 }]);
  });

  it('does not close a fence on a line indented four spaces', () => {
    const markdown = '```\n    ```\n# inside\n```\n# after\n';
    expect(outlineHeadings(markdown)).toEqual([{ level: 1, text: 'after', line: 5 }]);
  });

  it('closes a fence on a longer run with trailing spaces', () => {
    const markdown = '```\n# inside\n`````  \n# after\n';
    expect(outlineHeadings(markdown)).toEqual([{ level: 1, text: 'after', line: 4 }]);
  });

  it('does not read an indented code line as a heading', () => {
    const markdown = '    # not a heading\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('reads setext headings in a CRLF document', () => {
    const markdown = '# Top\r\n\r\nSetext\r\n=====\r\n\r\n## Sub ##\r\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([
      { level: 1, text: 'Top', line: 1 },
      { level: 1, text: 'Setext', line: 3 },
      { level: 2, text: 'Sub', line: 6 },
    ]);
  });

  it('ignores setext underline without text line', () => {
    const markdown = '\n==========\n';
    const entries = outlineHeadings(markdown);
    expect(entries).toEqual([]);
  });

  it('reads level five and six headings and ignores a seventh', () => {
    const markdown = '##### five\n###### six\n####### seven\n';
    expect(outlineHeadings(markdown)).toEqual([
      { level: 5, text: 'five', line: 1 },
      { level: 6, text: 'six', line: 2 },
    ]);
  });
});