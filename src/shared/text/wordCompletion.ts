export interface WordAtCursor {
  readonly prefix: string;
  readonly start: number;
}

const WORD_REGEX = /[\p{L}\p{N}_]/u;

function isWordChar(ch: string): boolean {
  return WORD_REGEX.test(ch);
}

function isSurrogatePairAt(text: string, offset: number): boolean {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return (
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}

function codePointAt(text: string, offset: number): string {
  const firstCodeUnit = text.charAt(offset);
  return isSurrogatePairAt(text, offset + 1)
    ? text.slice(offset, offset + 2)
    : firstCodeUnit;
}

function previousCodePointStart(text: string, offset: number): number {
  const previous = offset - 1;
  return previous > 0 && isSurrogatePairAt(text, previous)
    ? previous - 1
    : previous;
}

export function wordAt(text: string, cursorOffset: number): WordAtCursor {
  let clampedOffset = Math.max(0, Math.min(cursorOffset, text.length));

  if (isSurrogatePairAt(text, clampedOffset)) {
    clampedOffset--;
  }

  if (clampedOffset === 0) {
    return { prefix: '', start: 0 };
  }

  let start = previousCodePointStart(text, clampedOffset);
  const charBefore = text.slice(start, clampedOffset);
  if (!isWordChar(charBefore)) {
    return { prefix: '', start: clampedOffset };
  }

  while (start > 0) {
    const previous = previousCodePointStart(text, start);
    if (!isWordChar(text.slice(previous, start))) {
      break;
    }
    start = previous;
  }

  return {
    prefix: text.slice(start, clampedOffset),
    start,
  };
}

export function completeWord(
  text: string,
  cursorOffset: number,
  maxWords: number = 20
): readonly string[] {
  if (maxWords <= 0) {
    return [];
  }

  const { prefix, start: cursorWordStart } = wordAt(text, cursorOffset);

  if (Array.from(prefix).length < 2) {
    return [];
  }

  const lowerPrefix = prefix.toLowerCase();
  const results: string[] = [];
  const seen = new Set<string>();

  let i = 0;
  const len = text.length;

  while (i < len) {
    const codePoint = codePointAt(text, i);
    if (!isWordChar(codePoint)) {
      i += codePoint.length;
      continue;
    }

    const wordStart = i;
    let wordCodePoint = codePoint;
    while (isWordChar(wordCodePoint)) {
      i += wordCodePoint.length;
      wordCodePoint = codePointAt(text, i);
    }
    const wordEnd = i;

    const word = text.slice(wordStart, wordEnd);
    const lowerWord = word.toLowerCase();

    if (
      word.length > prefix.length &&
      lowerWord.startsWith(lowerPrefix) &&
      wordStart !== cursorWordStart &&
      !seen.has(lowerWord)
    ) {
      seen.add(lowerWord);
      results.push(word);
      if (results.length >= maxWords) {
        break;
      }
    }
  }

  return results;
}
