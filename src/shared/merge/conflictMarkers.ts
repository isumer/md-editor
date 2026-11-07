export interface MarkerRange {
  readonly start: number;
  readonly end: number;
}

export interface ConflictBlock {
  readonly left: MarkerRange;
  readonly right: MarkerRange;
}

export interface ConflictFile {
  readonly left: string;
  readonly right: string;
  readonly conflicts: readonly ConflictBlock[];
}

export type ConflictParseFailure =
  | 'start-without-separator'
  | 'start-without-end'
  | 'separator-outside-block'
  | 'end-outside-block';

export type ConflictParseResult =
  | { readonly ok: true; readonly file: ConflictFile }
  | { readonly ok: false; readonly reason: ConflictParseFailure };

type ParseState = 'outside' | 'left' | 'right';

interface ParseContext {
  readonly left: string[];
  readonly right: string[];
  readonly conflicts: ConflictBlock[];
  leftLength: number;
  rightLength: number;
  leftStart: number;
  rightStart: number;
  state: ParseState;
}

function splitLines(text: string): readonly string[] {
  const parts = text.split('\n');
  const lastIndex = parts.length - 1;

  return parts.map((part, index) => (index < lastIndex ? `${part}\n` : part));
}

function markerText(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

function isStartMarker(line: string): boolean {
  return markerText(line).startsWith('<<<<<<<');
}

function isSeparator(line: string): boolean {
  return /^=======\r?$/.test(markerText(line));
}

function isEndMarker(line: string): boolean {
  return markerText(line).startsWith('>>>>>>>');
}

function appendOutside(context: ParseContext, line: string): void {
  context.left.push(line);
  context.right.push(line);
  context.leftLength += line.length;
  context.rightLength += line.length;
}

function parseOutside(
  context: ParseContext,
  line: string,
): ConflictParseFailure | undefined {
  if (isStartMarker(line)) {
    context.leftStart = context.leftLength;
    context.rightStart = context.rightLength;
    context.state = 'left';
    return undefined;
  }
  if (isSeparator(line)) {
    return 'separator-outside-block';
  }
  if (isEndMarker(line)) {
    return 'end-outside-block';
  }
  appendOutside(context, line);
  return undefined;
}

function parseLeft(
  context: ParseContext,
  line: string,
): ConflictParseFailure | undefined {
  if (isStartMarker(line) || isEndMarker(line)) {
    return 'start-without-separator';
  }
  if (isSeparator(line)) {
    context.state = 'right';
  } else {
    context.left.push(line);
    context.leftLength += line.length;
  }
  return undefined;
}

function parseRight(
  context: ParseContext,
  line: string,
): ConflictParseFailure | undefined {
  if (isEndMarker(line)) {
    context.conflicts.push({
      left: { start: context.leftStart, end: context.leftLength },
      right: { start: context.rightStart, end: context.rightLength },
    });
    context.state = 'outside';
    return undefined;
  }
  if (isStartMarker(line)) {
    return 'start-without-end';
  }
  context.right.push(line);
  context.rightLength += line.length;
  return undefined;
}

function parseLine(
  context: ParseContext,
  line: string,
): ConflictParseFailure | undefined {
  if (context.state === 'outside') {
    return parseOutside(context, line);
  }
  if (context.state === 'left') {
    return parseLeft(context, line);
  }
  return parseRight(context, line);
}

export function parseConflictFile(text: string): ConflictParseResult {
  const context: ParseContext = {
    left: [],
    right: [],
    conflicts: [],
    leftLength: 0,
    rightLength: 0,
    leftStart: 0,
    rightStart: 0,
    state: 'outside',
  };

  for (const line of splitLines(text)) {
    const failure = parseLine(context, line);
    if (failure !== undefined) {
      return { ok: false, reason: failure };
    }
  }

  if (context.state !== 'outside') {
    const reason =
      context.state === 'left' ? 'start-without-separator' : 'start-without-end';
    return { ok: false, reason };
  }
  return {
    ok: true,
    file: {
      left: context.left.join(''),
      right: context.right.join(''),
      conflicts: context.conflicts,
    },
  };
}
