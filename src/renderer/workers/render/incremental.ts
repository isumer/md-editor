import { ChangeSet, Text } from "@codemirror/state";

import type {
  RenderBlock,
  RenderBlockPatch,
  RenderChangeSetJson,
  RenderLineShift,
} from "../../../shared/workers/render";
import {
  continuesPreviousBlock,
  DATA_LINE_PREFIX,
  hasReferenceCandidate,
  nextChunk,
  rangeIndexAt,
  referenceLabels,
  shiftChunkDataLines,
  splitChunksFrom,
  type LineRange,
  type LineReader,
} from "./chunks";
import {
  collectReferences,
  type ReferenceDefinition,
  type RenderEnvironment,
} from "./render";

export type ChunkRenderer = (source: string, env?: RenderEnvironment) => string;

export interface RenderBatch {
  blocks: RenderBlock[];
  complete: boolean;
}

export interface PatchBatch {
  blocks: RenderBlockPatch[];
  removed: string[];
  lineShifts: RenderLineShift[];
  complete: boolean;
}

interface RenderChunk {
  id: string;
  startLine: number;
  endLine: number;
  rendered: boolean;
  localHtml: string | null;
  labels: Set<string>;
  definitionCandidate: boolean;
}

interface ExpectedBoundary {
  index: number;
  endLine: number;
}

interface Replacement extends LineRange {
  definitionCandidate: boolean;
}

interface ChangedRange {
  startOld: number;
  endOld: number;
}

export const INITIAL_CHUNK_COUNT = 40;
const FILL_BATCH_SIZE = 64;
const PROGRESSIVE_BYTES = 2 * 1024 * 1024;

function textReader(document: Text): LineReader {
  return {
    length: document.lines,
    line: (index) => document.line(index + 1).text,
  };
}

function sourceOf(lines: LineReader, startLine: number, endLine: number): string {
  const selected: string[] = [];
  for (let line = startLine; line < endLine; line += 1) {
    selected.push(lines.line(line));
  }
  // Keep the line break after the last chunk line when one exists: raw HTML
  // blocks include it in their rendered output, and a full render has it.
  return endLine < lines.length ? `${selected.join("\n")}\n` : selected.join("\n");
}

function rangeHasCandidate(lines: LineReader, range: LineRange): boolean {
  for (let line = range.startLine; line < range.endLine; line += 1) {
    if (hasReferenceCandidate(lines.line(line))) {
      return true;
    }
  }
  return false;
}

interface ChangeBounds {
  from: number;
  to: number;
}

function changeBounds(changes: RenderChangeSetJson): ChangeBounds {
  let from = Number.POSITIVE_INFINITY;
  let to = -1;
  ChangeSet.fromJSON(changes).iterChanges((fromA, toA) => {
    from = Math.min(from, fromA);
    to = Math.max(to, toA);
  });
  return { from, to };
}

function changedReferenceLabels(
  previous: Record<string, ReferenceDefinition>,
  next: Record<string, ReferenceDefinition>,
): Set<string> {
  const changed = new Set<string>();
  for (const [label, definition] of Object.entries(next)) {
    const old = previous[label];
    if (!old || old.href !== definition.href || old.title !== definition.title) {
      changed.add(label);
    }
  }
  for (const label of Object.keys(previous)) {
    if (!(label in next)) {
      changed.add(label);
    }
  }
  return changed;
}

export class IncrementalRenderState {
  version: number;
  document: Text;
  readonly progressive: boolean;
  published = false;
  private chunks: RenderChunk[];
  private cursor = 0;
  private unrendered = 0;
  private readonly dirty = new Set<RenderChunk>();
  private readonly removed = new Set<string>();
  private pendingLineShifts: RenderLineShift[] = [];
  private references: Record<string, ReferenceDefinition> = {};
  private nextId = 1;

  constructor(
    readonly docId: string,
    readonly epoch: number,
    version: number,
    document: Text,
    private readonly renderText: ChunkRenderer,
  ) {
    this.version = version;
    this.document = document;
    this.progressive = document.length > PROGRESSIVE_BYTES;
    const lines = textReader(document);
    this.chunks = splitChunksFrom(lines).map((range) => {
      const chunk = this.newChunk(range.startLine, range.endLine);
      chunk.definitionCandidate = rangeHasCandidate(lines, range);
      return chunk;
    });
    this.refreshReferences();
  }

  get complete(): boolean {
    return this.cursor >= this.chunks.length && this.unrendered === 0;
  }

  initial(): RenderBatch {
    // Every block is rendered from the current document, so any shift that
    // accumulated before the first publish is already reflected in its lines.
    this.pendingLineShifts = [];
    const limit = this.progressive
      ? Math.min(INITIAL_CHUNK_COUNT, this.chunks.length)
      : this.chunks.length;
    const blocks: RenderBlock[] = [];
    while (this.cursor < limit) {
      const chunk = this.chunks[this.cursor] as RenderChunk;
      blocks.push(this.send(chunk));
      this.cursor += 1;
    }
    this.published = true;
    return { blocks, complete: this.complete };
  }

  patch(): PatchBatch {
    const pending: { chunk: RenderChunk; index: number }[] = [];
    for (const chunk of this.dirty) {
      const index = this.indexOf(chunk);
      if (index < 0) {
        this.dirty.delete(chunk);
      } else if (index < this.cursor) {
        pending.push({ chunk, index });
      }
    }
    pending.sort((left, right) => left.index - right.index);
    const blocks = pending.map(({ chunk, index }) => ({
      block: this.send(chunk),
      after: index > 0 ? (this.chunks[index - 1] as RenderChunk).id : null,
    }));
    const removed = [...this.removed];
    this.removed.clear();
    const lineShifts = this.pendingLineShifts;
    this.pendingLineShifts = [];
    return { blocks, removed, lineShifts, complete: this.complete };
  }

  fill(): RenderBatch {
    const blocks: RenderBlock[] = [];
    const end = Math.min(this.chunks.length, this.cursor + FILL_BATCH_SIZE);
    // Everything before the cursor has been sent; the fill pass starts on the
    // first chunk that has never been rendered.
    while (this.cursor < end) {
      const chunk = this.chunks[this.cursor] as RenderChunk;
      blocks.push(this.send(chunk));
      this.cursor += 1;
    }
    return { blocks, complete: this.complete };
  }

  applyChange(
    before: Text,
    after: Text,
    fromVersion: number,
    toVersion: number,
    changes: RenderChangeSetJson,
  ): void {
    if (this.version !== fromVersion) {
      return;
    }
    this.version = toVersion;
    this.document = after;
    const bounds = changeBounds(changes);
    if (bounds.to < 0) {
      return;
    }

    const changed = this.changedLines(before, bounds);
    const lineDelta = after.lines - before.lines;
    const first = this.firstAffectedChunk(changed.startOld, after);
    const chunkStart = first < this.chunks.length
      ? (this.chunks[first] as RenderChunk).startLine
      : changed.startOld;
    // A change before the first chunk starts a new block, so re-parse from the
    // changed line itself rather than from the old first chunk.
    const reparseStart = Math.min(chunkStart, changed.startOld);
    const expected = this.expectedBoundaries(changed.endOld, lineDelta);

    const lines = textReader(after);
    const previousLines = textReader(before);
    const replacements: Replacement[] = [];
    let stop = -1;
    let from = reparseStart;
    while (from < after.lines) {
      const range = nextChunk(lines, from);
      if (!range) {
        break;
      }
      // Same start and end lines are not enough: deleting line breaks can join
      // an untouched chunk's first line to the changed line. Compare the source
      // so only a genuinely unchanged chunk is reused.
      const match = this.unchangedBoundary(expected, range, lines, previousLines);
      if (match !== -1) {
        stop = match;
        break;
      }
      replacements.push({
        ...range,
        definitionCandidate: rangeHasCandidate(lines, range),
      });
      if (range.endLine <= from) {
        break;
      }
      from = range.endLine;
    }

    const last = stop === -1 ? this.chunks.length : stop;
    const removedChunks = this.chunks.splice(first, Math.max(0, last - first));
    let definitionsChanged = false;
    for (const chunk of removedChunks) {
      this.dirty.delete(chunk);
      if (!chunk.rendered) {
        this.unrendered -= 1;
      } else {
        this.removed.add(chunk.id);
      }
      definitionsChanged ||= chunk.definitionCandidate;
    }

    const beforeCursor = first < this.cursor;
    const inserted = replacements.map((range) => {
      const chunk = this.newChunk(range.startLine, range.endLine);
      chunk.definitionCandidate = range.definitionCandidate;
      definitionsChanged ||= range.definitionCandidate;
      return chunk;
    });
    this.chunks.splice(first, 0, ...inserted);
    if (beforeCursor) {
      for (const chunk of inserted) {
        this.dirty.add(chunk);
      }
    }
    if (lineDelta !== 0) {
      for (let index = first + inserted.length; index < this.chunks.length; index += 1) {
        const chunk = this.chunks[index] as RenderChunk;
        chunk.startLine += lineDelta;
        chunk.endLine += lineDelta;
      }
    }
    if (beforeCursor) {
      const tailCovered = stop === -1 ? 0 : Math.max(0, this.cursor - stop);
      this.cursor = first + inserted.length + tailCovered;
    }

    if (lineDelta !== 0) {
      this.pendingLineShifts.push({
        after: this.lineShiftAnchor(first, inserted),
        delta: lineDelta,
      });
    }
    if (definitionsChanged) {
      this.refreshReferences();
    }
  }

  private changedLines(before: Text, bounds: ChangeBounds): ChangedRange {
    const startOld = before.lineAt(bounds.from).number - 1;
    // The replacement ends at the last touched character, so deleting whole
    // lines ending at a line start does not include the following line.
    const endOld = bounds.to > bounds.from
      ? before.lineAt(bounds.to - 1).number
      : startOld + 1;
    return { startOld, endOld };
  }

  private firstAffectedChunk(startLine: number, after: Text): number {
    let first = rangeIndexAt(this.chunks, startLine);
    if (first >= this.chunks.length) {
      // Past the last block: only a line that can continue it (an indented
      // line or a list item) needs the last chunk re-parsed; a new standalone
      // trailing block can start after the published prefix.
      const line = startLine < after.lines ? after.line(startLine + 1).text : "";
      return this.chunks.length > 0 && continuesPreviousBlock(line)
        ? this.chunks.length - 1
        : this.chunks.length;
    }
    if (first > 0) {
      const chunk = this.chunks[first];
      const line = startLine < after.lines ? after.line(startLine + 1).text : "";
      // A change in a blank separator belongs to the block above it, and a line
      // that becomes indented or a list item can join a list across the blank.
      if ((chunk && chunk.startLine > startLine) || continuesPreviousBlock(line)) {
        first -= 1;
      }
    }
    return first;
  }

  // Chunks whose start line is at or after the end of the change keep their
  // contents, so a re-parse that lands on one of their boundaries can reuse
  // them. Their lines have all moved by the change's line delta.
  private expectedBoundaries(
    endOld: number,
    lineDelta: number,
  ): Map<number, ExpectedBoundary[]> {
    const expected = new Map<number, ExpectedBoundary[]>();
    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index] as RenderChunk;
      if (chunk.startLine < endOld) {
        continue;
      }
      const start = chunk.startLine + lineDelta;
      const boundary = { index, endLine: chunk.endLine + lineDelta };
      const list = expected.get(start);
      if (list) {
        list.push(boundary);
      } else {
        expected.set(start, [boundary]);
      }
    }
    return expected;
  }

  private unchangedBoundary(
    expected: Map<number, ExpectedBoundary[]>,
    range: LineRange,
    lines: LineReader,
    previousLines: LineReader,
  ): number {
    const candidates = expected.get(range.startLine);
    if (!candidates) {
      return -1;
    }
    const source = sourceOf(lines, range.startLine, range.endLine);
    for (const boundary of candidates) {
      if (boundary.endLine !== range.endLine) {
        continue;
      }
      const chunk = this.chunks[boundary.index] as RenderChunk;
      if (sourceOf(previousLines, chunk.startLine, chunk.endLine) === source) {
        return boundary.index;
      }
    }
    return -1;
  }

  private lineShiftAnchor(first: number, inserted: readonly RenderChunk[]): string | null {
    const tail = first + inserted.length;
    if (inserted.length > 0) {
      return (inserted[inserted.length - 1] as RenderChunk).id;
    }
    return tail > 0 ? (this.chunks[tail - 1] as RenderChunk).id : null;
  }

  private indexOf(chunk: RenderChunk): number {
    const index = rangeIndexAt(this.chunks, chunk.startLine);
    return this.chunks[index] === chunk ? index : -1;
  }

  private newChunk(startLine: number, endLine: number): RenderChunk {
    const chunk: RenderChunk = {
      id: `block-${String(this.nextId)}`,
      startLine,
      endLine,
      rendered: false,
      localHtml: null,
      labels: new Set(),
      definitionCandidate: false,
    };
    this.nextId += 1;
    this.unrendered += 1;
    return chunk;
  }

  private send(chunk: RenderChunk): RenderBlock {
    if (chunk.localHtml === null) {
      const source = sourceOf(textReader(this.document), chunk.startLine, chunk.endLine);
      chunk.labels = referenceLabels(source);
      chunk.localHtml = this.renderText(source, this.environment());
    }
    if (!chunk.rendered) {
      chunk.rendered = true;
      this.unrendered -= 1;
    }
    this.dirty.delete(chunk);
    return {
      id: chunk.id,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      html: shiftChunkDataLines(chunk.localHtml, chunk.startLine),
    };
  }

  private environment(): RenderEnvironment {
    const environment: RenderEnvironment = { dataLinePrefix: DATA_LINE_PREFIX };
    if (Object.keys(this.references).length > 0) {
      environment.references = { ...this.references };
    }
    return environment;
  }

  // Reference definitions are gathered in document order with first-definition
  // wins, matching a full markdown-it parse. When the merged set changes, only
  // chunks that used an affected label need to be rendered again.
  private refreshReferences(): void {
    const next: Record<string, ReferenceDefinition> = {};
    for (const chunk of this.chunks) {
      if (!chunk.definitionCandidate) {
        continue;
      }
      const definitions = collectReferences(
        sourceOf(textReader(this.document), chunk.startLine, chunk.endLine),
      );
      for (const [label, definition] of Object.entries(definitions)) {
        if (!(label in next)) {
          next[label] = definition;
        }
      }
    }

    const changed = changedReferenceLabels(this.references, next);
    if (changed.size === 0) {
      return;
    }
    this.references = next;
    for (const chunk of this.chunks) {
      if (!chunk.rendered) {
        continue;
      }
      let affected = false;
      for (const label of chunk.labels) {
        if (changed.has(label)) {
          affected = true;
          break;
        }
      }
      if (affected) {
        chunk.rendered = false;
        chunk.localHtml = null;
        chunk.labels = new Set();
        this.unrendered += 1;
        this.dirty.add(chunk);
      }
    }
  }
}
