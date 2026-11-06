export interface OutlineEntry {
  level: number;
  text: string;
  line: number;
}

function isFenceLine(line: string): { char: string; length: number } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match || !match[1]) return null;
  const run = match[1];
  const char = run.startsWith('`') ? '`' : '~';
  return { char, length: run.length };
}

function isFenceClose(line: string, char: string, length: number): boolean {
  const pattern = new RegExp(`^ {0,3}${char}{${length},}[ \t]*$`);
  return pattern.test(line);
}

function parseAtxHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^ {0,3}(#{1,6})(?: (.*)|$)/);
  if (!match || !match[1]) return null;
  const level = match[1].length;
  let text = match[2] ?? '';
  if (text.length > 0) {
    const closingHashMatch = text.match(/ (#+)$/);
    if (closingHashMatch && closingHashMatch[0]) {
      text = text.slice(0, -closingHashMatch[0].length);
    }
  }
  text = text.trim();
  if (text.length === 0) return null;
  return { level, text };
}

function parseSetextHeading(line: string, nextLine: string): { level: number; text: string } | null {
  const match = nextLine.match(/^ {0,3}(=+|-+)$/);
  if (!match || !match[1] || line.trim().length === 0) return null;
  const level = match[1][0] === '=' ? 1 : 2;
  const text = line.trim();
  if (text.length === 0) return null;
  return { level, text };
}

export function outlineHeadings(markdown: string): OutlineEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: OutlineEntry[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const lineNum = i + 1;

    if (!inFence) {
      const fence = isFenceLine(line);
      if (fence) {
        inFence = true;
        fenceChar = fence.char;
        fenceLength = fence.length;
        continue;
      }
    } else {
      if (isFenceClose(line, fenceChar, fenceLength)) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }

    const atx = parseAtxHeading(line);
    if (atx) {
      entries.push({ level: atx.level, text: atx.text, line: lineNum });
      continue;
    }

    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine === undefined) continue;
      const setext = parseSetextHeading(line, nextLine);
      if (setext) {
        entries.push({ level: setext.level, text: setext.text, line: lineNum });
        i++;
        continue;
      }
    }
  }

  return entries;
}