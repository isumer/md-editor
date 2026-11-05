import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LANGUAGE_BY_EXTENSION,
  languageForPath,
} from '../../src/shared/text/language';

describe('AC-R12-02: language detection', () => {
  it('AC-R12-02: maps every extension in docs/languages.md to its id', () => {
    const content = readFileSync(
      new URL('../../docs/languages.md', import.meta.url),
      'utf8',
    );

    const extensionToId = new Map<string, string>();

    for (const line of content.split('\n')) {
      const match = line.match(/^\| [^|]+ \| `([^`]+)` \| `([^|]+)`/);
      if (!match) continue;

      const [, id, extensionsCell] = match;
      if (id === 'id' || !extensionsCell) continue; // skip header
      const languageId = id as string;

      for (const ext of extensionsCell.split(',')) {
        const cleaned = ext.trim().replace(/`/g, '');
        if (cleaned.startsWith('.')) {
          // Handle Makefile row: '.mak (and Makefile)' -> extract 'mak'
          const key = cleaned.slice(1).split(' ')[0];
          if (key) extensionToId.set(key, languageId);
        }
      }
    }

    const expected = Object.fromEntries(extensionToId);
    expect(LANGUAGE_BY_EXTENSION).toEqual(expected);
  });

  it('AC-R12-02: maps a full path by its last extension', () => {
    expect(languageForPath('/a/b/notes.md')).toBe('markdown');
    expect(languageForPath('C:\\notes\\Main.PY')).toBe('python');
    expect(languageForPath('x.tar.gz')).toBeUndefined();
  });

  it('AC-R12-02: maps Makefile without an extension', () => {
    expect(languageForPath('Makefile')).toBe('makefile');
    expect(languageForPath('makefile')).toBe('makefile');
    expect(languageForPath('/dir/Makefile')).toBe('makefile');
    expect(languageForPath('C:\\dir\\Makefile')).toBe('makefile');
  });

  it('AC-R12-02: ignores dotfiles and trailing dots', () => {
    expect(languageForPath('.gitignore')).toBeUndefined();
    expect(languageForPath('.md')).toBeUndefined();
    expect(languageForPath('notes.')).toBeUndefined();
  });

  it('AC-R12-02: returns undefined for an unknown extension', () => {
    expect(languageForPath('notes.zzz')).toBeUndefined();
  });
});
