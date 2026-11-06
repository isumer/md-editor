export type LineEnding = 'crlf' | 'lf' | 'cr';

export function detectLineEnding(text: string): LineEnding | undefined {
  if (text.length === 0) {
    return undefined;
  }

  let crlfCount = 0;
  let lfCount = 0;
  let crCount = 0;
  let firstCrlfIndex = -1;
  let firstLfIndex = -1;
  let firstCrIndex = -1;

  let i = 0;
  while (i < text.length) {
    if (text[i] === '\r') {
      if (i + 1 < text.length && text[i + 1] === '\n') {
        crlfCount++;
        if (firstCrlfIndex === -1) {
          firstCrlfIndex = i;
        }
        i += 2;
      } else {
        crCount++;
        if (firstCrIndex === -1) {
          firstCrIndex = i;
        }
        i++;
      }
    } else if (text[i] === '\n') {
      lfCount++;
      if (firstLfIndex === -1) {
        firstLfIndex = i;
      }
      i++;
    } else {
      i++;
    }
  }

  if (crlfCount === 0 && lfCount === 0 && crCount === 0) {
    return undefined;
  }

  const counts = [
    { kind: 'crlf' as LineEnding, count: crlfCount, firstIndex: firstCrlfIndex },
    { kind: 'lf' as LineEnding, count: lfCount, firstIndex: firstLfIndex },
    { kind: 'cr' as LineEnding, count: crCount, firstIndex: firstCrIndex },
  ];

  counts.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    if (a.firstIndex === -1) return 1;
    if (b.firstIndex === -1) return -1;
    return a.firstIndex - b.firstIndex;
  });

  const top = counts[0];
  if (!top) {
    return undefined;
  }
  return top.kind;
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