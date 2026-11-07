export interface WordAtCursor {
  readonly prefix: string;
  readonly start: number;
}

const WORD_REGEX = /[\p{L}\p{N}_]/u;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_REGEX.test(ch);
}

export function wordAt(text: string, cursorOffset: number): WordAtCursor {
  const clampedOffset = Math.max(0, Math.min(cursorOffset, text.length));

  if (clampedOffset === 0) {
    return { prefix: '', start: 0 };
  }

  const charBefore = text[clampedOffset - 1];
  if (!isWordChar(charBefore)) {
    return { prefix: '', start: clampedOffset };
  }

  let start = clampedOffset - 1;
  while (start > 0 && isWordChar(text[start - 1])) {
    start--;
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

  if (prefix.length < 2) {
    return [];
  }

  const lowerPrefix = prefix.toLowerCase();
  const results: string[] = [];
  const seen = new Set<string>();

  let i = 0;
  const len = text.length;

  while (i < len) {
    if (!isWordChar(text[i])) {
      i++;
      continue;
    }

    const wordStart = i;
    while (i < len && isWordChar(text[i])) {
      i++;
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