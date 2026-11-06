export type LineEnding = 'crlf' | 'lf' | 'cr';

interface BreakCounts {
  crlf: number;
  lf: number;
  cr: number;
}

interface FirstBreaks {
  crlf: number;
  lf: number;
  cr: number;
}

function scanBreaks(text: string): { counts: BreakCounts; first: FirstBreaks } {
  const counts: BreakCounts = { crlf: 0, lf: 0, cr: 0 };
  const first: FirstBreaks = { crlf: -1, lf: -1, cr: -1 };
  let i = 0;

  while (i < text.length) {
    if (text[i] === '\r' && text[i + 1] === '\n') {
      counts.crlf++;
      if (first.crlf === -1) {
        first.crlf = i;
      }
      i += 2;
    } else if (text[i] === '\r') {
      counts.cr++;
      if (first.cr === -1) {
        first.cr = i;
      }
      i++;
    } else if (text[i] === '\n') {
      counts.lf++;
      if (first.lf === -1) {
        first.lf = i;
      }
      i++;
    } else {
      i++;
    }
  }

  return { counts, first };
}

const ENDING_KINDS: readonly LineEnding[] = ['crlf', 'lf', 'cr'];

function mostFrequent(
  counts: BreakCounts,
  first: FirstBreaks,
): LineEnding | undefined {
  let top: LineEnding | undefined;

  for (const kind of ENDING_KINDS) {
    if (counts[kind] === 0) {
      continue;
    }
    if (top === undefined) {
      top = kind;
      continue;
    }
    if (counts[kind] > counts[top]) {
      top = kind;
    } else if (counts[kind] === counts[top] && first[kind] < first[top]) {
      top = kind;
    }
  }

  return top;
}

export function detectLineEnding(text: string): LineEnding | undefined {
  if (text.length === 0) {
    return undefined;
  }

  const { counts, first } = scanBreaks(text);
  return mostFrequent(counts, first);
}

export function applyLineEnding(text: string, ending: LineEnding): string {
  if (text.length === 0) {
    return text;
  }

  const endingStr = ending === 'crlf' ? '\r\n' : ending === 'lf' ? '\n' : '\r';

  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        result += endingStr;
        i += 2;
      } else {
        result += endingStr;
        i++;
      }
    } else if (text[i] === '\n') {
      result += endingStr;
      i++;
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
}
