export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface LineReader {
  readonly length: number;
  line(index: number): string;
}

interface Fence {
  character: string;
  length: number;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LIST_MARKER = /^ {0,3}(?:[-+*](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$))/;
const INDENTED = /^[ \t]/;

// HTML blocks of these kinds can contain blank lines; the others end at one.
const HTML_BLOCK_STARTS: readonly RegExp[] = [
  /^ {0,3}<(?:script|pre|style|textarea)(?=\s|>|$)/i,
  /^ {0,3}<!--/,
  /^ {0,3}<\?/,
  /^ {0,3}<![A-Za-z]/,
  /^ {0,3}<!\[CDATA\[/,
];
const HTML_BLOCK_ENDS: readonly RegExp[] = [
  /<\/(?:script|pre|style|textarea)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];

function openingFence(line: string): Fence | null {
  const match = FENCE_OPEN.exec(line);
  const marker = match?.[1];
  if (!marker) {
    return null;
  }
  // markdown-it rejects a backtick fence whose info string contains a backtick,
  // so a broken line like "```pytho`n" starts a paragraph, not code.
  if (marker.charAt(0) === "`" && line.slice(match[0].length).includes("`")) {
    return null;
  }
  return { character: marker.charAt(0), length: marker.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const marker = line.trim();
  return marker.length >= fence.length &&
    marker.split("").every((character) => character === fence.character);
}

function htmlBlockEnd(line: string): RegExp | null {
  for (const [index, start] of HTML_BLOCK_STARTS.entries()) {
    const end = HTML_BLOCK_ENDS[index];
    if (end && start.test(line) && !end.test(line)) {
      return end;
    }
  }
  return null;
}

// A blank line may separate chunks only when the next block is a fresh
// top-level block. Indented or list-marker continuations may still belong to
// the block above (for example a loose list or an indented code block).
function separatesBlocks(nextLine: string): boolean {
  return !continuesPreviousBlock(nextLine);
}

// A line that can still belong to the block above it across a blank line: an
// indented continuation or another item of a loose list.
export function continuesPreviousBlock(line: string): boolean {
  return INDENTED.test(line) || LIST_MARKER.test(line);
}

interface VirtualLine {
  // The CodeMirror line this markdown line belongs to.
  index: number;
  text: string;
  // True when nothing follows this markdown line inside its CodeMirror line, so
  // a chunk boundary here can be expressed as a line range.
  last: boolean;
  // True when this is the only Markdown line of its CodeMirror line.
  whole: boolean;
}

// markdown-it normalizes both CRLF and lone CR to a line break, while CodeMirror
// splits only on LF. A random edit can therefore leave a lone CR inside one
// CodeMirror line, and the block structure after it must still be recognized.
function* virtualLinesFrom(lines: LineReader, from: number): Generator<VirtualLine> {
  for (let index = from; index < lines.length; index += 1) {
    const parts = lines.line(index).split(/\r\n?|\n/);
    // A trailing CR is the line break itself, not an extra empty Markdown line.
    if (parts.length > 1 && parts[parts.length - 1] === "") {
      parts.pop();
    }
    for (const [part, text] of parts.entries()) {
      yield {
        index,
        text,
        last: part === parts.length - 1,
        whole: parts.length === 1,
      };
    }
  }
}

// Yields the next range of lines forming one independently renderable group of
// top-level Markdown blocks, or null at the end of the document. Ranges exclude
// the blank separator lines after them.
export function nextChunk(lines: LineReader, from: number): LineRange | null {
  let start = -1;
  let fence: Fence | null = null;
  let htmlEnd: RegExp | null = null;
  const iterator = virtualLinesFrom(lines, from);
  let current = iterator.next();

  while (!current.done) {
    const line = current.value;
    if (fence) {
      if (closesFence(line.text, fence)) {
        fence = null;
      }
      current = iterator.next();
      continue;
    }
    if (htmlEnd) {
      if (htmlEnd.test(line.text)) {
        htmlEnd = null;
      }
      current = iterator.next();
      continue;
    }
    if (line.text.trim() === "") {
      if (start !== -1 && line.last) {
        let next = iterator.next();
        while (!next.done && next.value.text.trim() === "") {
          next = iterator.next();
        }
        if (next.done || separatesBlocks(next.value.text)) {
          // A blank CodeMirror line is left out of both neighbouring chunks;
          // a boundary inside a mixed line has to include that whole line.
          return { startLine: start, endLine: line.whole ? line.index : line.index + 1 };
        }
        // A blank in the middle of a CodeMirror line cannot be a chunk boundary;
        // keep scanning after it.
        current = next;
        continue;
      }
      current = iterator.next();
      continue;
    }
    if (start === -1) {
      start = line.index;
    }
    const opened = openingFence(line.text);
    if (opened) {
      fence = opened;
    } else {
      htmlEnd = htmlBlockEnd(line.text);
    }
    current = iterator.next();
  }

  return start === -1 ? null : { startLine: start, endLine: lines.length };
}

function arrayReader(lines: readonly string[]): LineReader {
  return {
    length: lines.length,
    // nextChunk reads only indexes below the length it was given.
    line: (index) => lines[index] as string,
  };
}

export function splitChunksFrom(reader: LineReader): LineRange[] {
  const ranges: LineRange[] = [];
  let from = 0;
  for (;;) {
    const range = nextChunk(reader, from);
    if (!range) {
      return ranges;
    }
    ranges.push(range);
    from = range.endLine;
  }
}

export function splitChunks(lines: readonly string[]): LineRange[] {
  return splitChunksFrom(arrayReader(lines));
}

// The index of the first range that contains or follows the line.
export function rangeIndexAt(ranges: readonly LineRange[], line: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const range = ranges[middle];
    if (!range || range.endLine <= line) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

// Marks line numbers the source-lines rule generated. Raw HTML in a document
// can contain its own data-line attributes, which must not be shifted.
export const DATA_LINE_PREFIX = "";

// Markdown-it numbers data-line from the start of the source it is given, so a
// chunk rendered alone must shift its block lines back into document space.
export function shiftChunkDataLines(html: string, offset: number): string {
  return html.replace(/(\d+)/g, (_match, line: string) =>
    String(Number(line) + offset));
}

// Labels referenced by a chunk; used to re-render only the blocks whose links
// a changed reference definition can affect.
export function referenceLabels(source: string): Set<string> {
  const labels = new Set<string>();
  for (const match of source.matchAll(/\[([^\[\]\n]{1,999})\]/g)) {
    // The pattern has exactly one capture group, so the label is always set.
    const label = normalizeLabel(match[1] as string);
    if (label !== "") {
      labels.add(label);
    }
  }
  return labels;
}

// markdown-it folds labels with lowercase().toUpperCase(); match its keys so
// dependency tracking and env lookups agree.
export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();
}

export function hasReferenceCandidate(source: string): boolean {
  return /\[[^\[\]\n]{1,999}\]:/.test(source);
}
