interface ClampedRange {
  readonly start: number;
  readonly end: number;
}

function assertColumn(column: number): void {
  if (!Number.isInteger(column) || column < 1) {
    throw new RangeError('column must be an integer of at least 1');
  }
}

function assertLineNumber(name: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`);
  }
}

function clampRange(
  lines: readonly string[],
  startLine: number,
  endLine: number,
): ClampedRange {
  const last = lines.length - 1;
  if (last < 0) {
    return { start: 0, end: -1 };
  }
  return {
    start: Math.min(Math.max(startLine, 0), last),
    end: Math.min(Math.max(endLine, 0), last),
  };
}

function isSurrogatePairAt(line: string, index: number): boolean {
  const before = line.charCodeAt(index - 1);
  const after = line.charCodeAt(index);
  return (
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}

function insertOnLine(line: string, column: number, text: string): string {
  let index = column - 1;
  if (line.length < index) {
    return `${line}${' '.repeat(index - line.length)}${text}`;
  }
  if (index > 0 && index < line.length && isSurrogatePairAt(line, index)) {
    index -= 1;
  }
  return `${line.slice(0, index)}${text}${line.slice(index)}`;
}

export function insertTextAtColumn(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  column: number,
  text: string,
): string[] {
  assertColumn(column);
  assertLineNumber('startLine', startLine);
  assertLineNumber('endLine', endLine);
  const { start, end } = clampRange(lines, startLine, endLine);
  return lines.map((line, index) =>
    index >= start && index <= end ? insertOnLine(line, column, text) : line,
  );
}

export function insertNumbersAtColumn(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  column: number,
  first: number,
  step: number,
): string[] {
  assertColumn(column);
  assertLineNumber('startLine', startLine);
  assertLineNumber('endLine', endLine);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(step)) {
    throw new RangeError('first and step must be safe integers');
  }
  const { start, end } = clampRange(lines, startLine, endLine);
  return lines.map((line, index) =>
    index >= start && index <= end
      ? insertOnLine(line, column, String(first + step * (index - start)))
      : line,
  );
}
