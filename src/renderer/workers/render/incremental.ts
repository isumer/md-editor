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
  referenceLabels,
  shiftChunkDataLines,
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
  // Line numbers are stored relative to the chunk's line segment. A line-count
  // change updates one segment base instead of every following chunk.
  startLine: number;
  endLine: number;
  rendered: boolean;
  // Raw rendered HTML lets reference changes update published chunks.
  html: string | null;
  labels: Set<string>;
  definitionCandidate: boolean;
}

interface PreparedBlock {
  block: RenderBlock;
  html: string;
  labels: Set<string>;
}

interface LineSegment {
  // Chunk index where this base starts; bases are absolute line offsets.
  start: number;
  base: number;
}

interface Replacement extends LineRange {
  definitionCandidate: boolean;
}

interface ChangedRange {
  startOld: number;
  endOld: number;
}

// Only the first screen is sent in the initial replace. The rest arrives in
// acknowledged fill batches so no single main-thread task is large.
export const INITIAL_CHUNK_COUNT = 12;
const FILL_BATCH_SIZE = 8;
const PROGRESSIVE_CHUNKS_PER_BLOCK = 16;
export const RENDER_BATCH_BYTE_LIMIT = 256 * 1024;
const PROGRESSIVE_BYTES = 2 * 1024 * 1024;
// A fill task runs to its time budget so a keystroke's render request waits at
// most one short task: eight blocks can cost over half the 50 ms keystroke
// budget on a slow machine, and the worker cannot preempt a running task.
const FILL_TASK_BUDGET_MS = 2;
const UTF8_ENCODER = new TextEncoder();
const UTF8_SCRATCH = new Uint8Array(RENDER_BATCH_BYTE_LIMIT + 1);
// Segment lookups are linear; compacting an edit-heavy session keeps the list
// short. Compaction is amortised over the edits that created the segments.
const MAX_LINE_SEGMENTS = 64;

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

function renderedBytesWithin(html: string, limit: number): number {
  // Reuse one bounded buffer so byte accounting does not add a full encoded
  // allocation and its collection cost for every rendered block.
  if (html.length > limit) {
    return limit + 1;
  }
  const encoded = UTF8_ENCODER.encodeInto(html, UTF8_SCRATCH);
  return encoded.read < html.length || encoded.written > limit
    ? limit + 1
    : encoded.written;
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
  private splitCursor = 0;
  private fullySplit = false;
  private unrendered = 0;
  private readonly dirty = new Set<RenderChunk>();
  private readonly removed = new Set<string>();
  private pendingLineShifts: RenderLineShift[] = [];
  private pendingBlock: PreparedBlock | null = null;
  private references: Record<string, ReferenceDefinition> = {};
  private segments: LineSegment[] = [{ start: 0, base: 0 }];
  private nextId = 1;
  private lineWrites = 0;
  private initialEndLine: number | null = null;

  // Counts chunk line-field writes so a test can assert that a keystroke does
  // not touch every chunk after the change.
  get chunkLineWrites(): number {
    return this.lineWrites;
  }

  constructor(
    readonly docId: string,
    readonly epoch: number,
    version: number,
    document: Text,
    private readonly renderText: ChunkRenderer,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.version = version;
    this.document = document;
    this.progressive = document.length > PROGRESSIVE_BYTES;
    this.chunks = [];
    // Split only the first screen. The fill pass extends the chunk list as it
    // consumes it, which keeps a 20 MB open off the critical path.
    this.ensureChunks(INITIAL_CHUNK_COUNT);
    this.initialEndLine = this.splitCursor;
    this.refreshReferences();
  }

  get complete(): boolean {
    return this.fullySplit && this.cursor >= this.chunks.length &&
      this.unrendered === 0;
  }

  // Splits chunks from the current document until the list has `count` entries
  // or the document ends. New reference candidates can change how already
  // rendered chunks resolve links, so merge them immediately.
  private ensureChunks(count: number): void {
    if (this.fullySplit) {
      return;
    }
    const lines = textReader(this.document);
    let candidate = false;
    while (this.chunks.length < count) {
      const range = this.nextRenderRange(lines, this.splitCursor);
      if (!range) {
        this.fullySplit = true;
        break;
      }
      const base = this.offsetAt(this.chunks.length);
      const chunk = this.newChunk(
        range.startLine - base,
        range.endLine - base,
      );
      chunk.definitionCandidate = rangeHasCandidate(lines, range);
      candidate ||= chunk.definitionCandidate;
      this.chunks.push(chunk);
      this.splitCursor = range.endLine;
    }
    if (candidate) {
      this.refreshReferences();
    }
  }

  private nextRenderRange(lines: LineReader, from: number): LineRange | null {
    const first = nextChunk(lines, from);
    if (first === null) return null;
    const grouped = this.progressive && this.initialEndLine !== null &&
      from >= this.initialEndLine;
    let endLine = first.endLine;
    for (let count = 1; grouped && count < PROGRESSIVE_CHUNKS_PER_BLOCK; count += 1) {
      const next = nextChunk(lines, endLine);
      if (next === null) break;
      endLine = next.endLine;
    }
    return { startLine: first.startLine, endLine };
  }

  // The change handlers compare against the old chunk list, so the list must
  // reach every block the change can touch before the document is replaced.
  private splitThrough(line: number): void {
    while (!this.fullySplit) {
      const last = this.chunks.length - 1;
      if (last >= 0 && this.endOf(last) > line) {
        return;
      }
      this.ensureChunks(this.chunks.length + 1);
    }
  }

  initial(): RenderBatch {
    // Every block is rendered from the current document, so any shift that
    // accumulated before the first publish is already reflected in its lines.
    this.pendingLineShifts = [];
    const blocks = this.nextBatch(INITIAL_CHUNK_COUNT);
    this.published = true;
    return { blocks, complete: this.complete };
  }

  patch(): PatchBatch {
    const pending: { chunk: RenderChunk; index: number }[] = [];
    for (const chunk of this.dirty) {
      // Removed chunks leave the dirty set in applyChange, so every entry exists.
      const index = this.indexOf(chunk);
      if (index < this.cursor) {
        pending.push({ chunk, index });
      }
    }
    pending.sort((left, right) => left.index - right.index);
    const blocks = pending.map(({ chunk, index }) => ({
      block: this.send(chunk, index),
      after: index > 0 ? (this.chunks[index - 1] as RenderChunk).id : null,
    }));
    const removed = [...this.removed];
    this.removed.clear();
    const lineShifts = this.pendingLineShifts;
    this.pendingLineShifts = [];
    return { blocks, removed, lineShifts, complete: this.complete };
  }

  fill(): RenderBatch {
    const blocks = this.nextBatch(
      FILL_BATCH_SIZE,
      this.now() + FILL_TASK_BUDGET_MS,
    );
    return { blocks, complete: this.complete };
  }

  private nextBatch(countLimit: number, deadline?: number): RenderBlock[] {
    this.ensureChunks(this.cursor + countLimit);
    const blocks: RenderBlock[] = [];
    const end = Math.min(this.chunks.length, this.cursor + countLimit);
    let bytes = 0;
    // Everything before the cursor has been sent. This batch starts on the
    // first chunk that has never been rendered.
    while (this.cursor < end) {
      // Always send one block so a slow stretch cannot starve the fill pass.
      if (blocks.length > 0 && deadline !== undefined && this.now() >= deadline) {
        break;
      }
      const chunk = this.chunks[this.cursor] as RenderChunk;
      const prepared = this.pendingBlock
        ? this.pendingBlock
        : this.prepare(chunk, this.cursor);
      this.pendingBlock = null;
      const blockBytes = renderedBytesWithin(
        prepared.block.html,
        RENDER_BATCH_BYTE_LIMIT - bytes,
      );
      if (blocks.length > 0 && bytes + blockBytes > RENDER_BATCH_BYTE_LIMIT) {
        this.pendingBlock = prepared;
        break;
      }
      this.commit(chunk, prepared);
      blocks.push(prepared.block);
      bytes += blockBytes;
      this.cursor += 1;
      if (bytes >= RENDER_BATCH_BYTE_LIMIT) {
        break;
      }
    }
    return blocks;
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
    const bounds = changeBounds(changes);
    if (bounds.to < 0) {
      this.version = toVersion;
      this.document = after;
      return;
    }
    this.pendingBlock = null;

    const changed = this.changedLines(before, bounds);
    const lineDelta = after.lines - before.lines;
    if (this.initialEndLine !== null && changed.startOld < this.initialEndLine) {
      this.initialEndLine += lineDelta;
    }
    // Old chunks after the change are the only reuse candidates, so split
    // until one exists. The scan stays proportional to the change's position.
    this.splitThrough(changed.endOld);
    const first = this.firstAffectedChunk(changed.startOld, after);
    const chunkStart = first < this.chunks.length
      ? this.startOf(first)
      : changed.startOld;
    // A change before the first chunk starts a new block, so re-parse from the
    // changed line itself rather than from the old first chunk.
    const reparseStart = Math.min(chunkStart, changed.startOld);

    const lines = textReader(after);
    const previousLines = textReader(before);
    const replacements: Replacement[] = [];
    let candidate = this.firstStartAtOrAfter(changed.endOld);
    let stop = -1;
    let from = reparseStart;
    while (from < after.lines) {
      const range = this.nextRenderRange(lines, from);
      if (!range) {
        break;
      }
      // Walk old chunks that end before this new range: they were consumed by
      // the change. The first candidate that still covers the range and has the
      // same source is an unchanged boundary to reuse. Same lines are not
      // enough: deleting line breaks can join an untouched chunk's first line
      // to the changed line, so compare the source.
      while (stop === -1) {
        if (candidate >= this.chunks.length && !this.fullySplit) {
          this.ensureChunks(this.chunks.length + 1);
        }
        if (candidate >= this.chunks.length) {
          break;
        }
        const oldStart = this.startOf(candidate);
        const oldEnd = this.endOf(candidate);
        const newStart = oldStart + lineDelta;
        const newEnd = oldEnd + lineDelta;
        if (newEnd <= range.startLine) {
          candidate += 1;
          continue;
        }
        if (newStart === range.startLine && newEnd === range.endLine &&
          sourceOf(previousLines, oldStart, oldEnd) ===
            sourceOf(lines, range.startLine, range.endLine)) {
          stop = candidate;
        }
        break;
      }
      if (stop !== -1) {
        break;
      }
      replacements.push({
        ...range,
        definitionCandidate: rangeHasCandidate(lines, range),
      });
      from = range.endLine;
    }

    this.version = toVersion;
    this.document = after;
    if (!this.fullySplit) {
      // The unscanned remainder is still addressed in the old document.
      this.splitCursor += lineDelta;
    }

    const oldLength = this.chunks.length;
    const last = stop === -1 ? oldLength : stop;
    const removedCount = Math.max(0, last - first);
    // Bases are read before the splice: later chunks keep their local lines and
    // take the new base only from the rebuild.
    const firstBase = this.offsetAt(first);
    const lastBase = last < oldLength ? this.offsetAt(last) : firstBase;
    const removedChunks = this.chunks.splice(first, removedCount);
    this.rebuildSegments(first, last, oldLength, firstBase, lastBase,
      replacements.length);
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
      // Inserted chunks share the base that starts at `first`.
      const chunk = this.newChunk(
        range.startLine - firstBase,
        range.endLine - firstBase,
      );
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
    this.shiftLines(first + inserted.length, lineDelta);
    this.compactSegments();
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
    let first = this.chunkIndexAt(startLine);
    if (first >= this.chunks.length) {
      // Past the last block: only a line that can continue it (an indented
      // line or a list item) needs the last chunk re-parsed; a new standalone
      // trailing block can start after the published prefix.
      const line = after.line(Math.min(startLine + 1, after.lines)).text;
      return this.chunks.length > 0 && continuesPreviousBlock(line)
        ? this.chunks.length - 1
        : this.chunks.length;
    }
    if (first > 0) {
      const line = after.line(Math.min(startLine + 1, after.lines)).text;
      // A change in a blank separator belongs to the block above it, and a line
      // that becomes indented or a list item can join a list across the blank.
      if (this.startOf(first) > startLine || continuesPreviousBlock(line)) {
        first -= 1;
      }
    }
    return first;
  }

  private firstStartAtOrAfter(line: number): number {
    let low = 0;
    let high = this.chunks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.startOf(middle) < line) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  // First chunk whose end is after the line; chunk arrays stay ordered by line
  // while the segment bases carry the pending shifts.
  private chunkIndexAt(line: number): number {
    let low = 0;
    let high = this.chunks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.endOf(middle) <= line) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  private offsetAt(index: number): number {
    let low = 0;
    let high = this.segments.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const segment = this.segments[middle];
      if (segment && segment.start <= index) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return (this.segments[low - 1] as LineSegment).base;
  }

  private startOf(index: number): number {
    return (this.chunks[index] as RenderChunk).startLine + this.offsetAt(index);
  }

  private endOf(index: number): number {
    return (this.chunks[index] as RenderChunk).endLine + this.offsetAt(index);
  }

  // A line-count change moves one segment base; chunks after it keep their
  // local lines and resolve the new absolute line through the base.
  private shiftLines(index: number, delta: number): void {
    if (delta === 0 || index >= this.chunks.length) {
      return;
    }
    const base = this.offsetAt(index);
    const at = this.segments.findIndex((segment) => segment.start >= index);
    if (at === -1) {
      this.segments.push({ start: index, base });
    } else if ((this.segments[at] as LineSegment).start > index) {
      this.segments.splice(at, 0, { start: index, base });
    }
    for (const segment of this.segments) {
      if (segment.start >= index) {
        segment.base += delta;
      }
    }
  }

  // Rebuilds the segment list around a spliced chunk range. Chunks after the
  // splice keep their local lines; only the bases around the edit change.
  private rebuildSegments(
    first: number,
    last: number,
    oldLength: number,
    firstBase: number,
    lastBase: number,
    inserted: number,
  ): void {
    const net = inserted - (last - first);
    const parts: LineSegment[] = this.segments
      .filter((segment) => segment.start < first);
    parts.push({ start: first, base: firstBase });
    if (last < oldLength) {
      const survivorStart = first + inserted;
      if (survivorStart === first) {
        // Nothing was inserted: survivors start at the boundary itself.
        (parts[parts.length - 1] as LineSegment).base = lastBase;
      } else if (lastBase !== firstBase) {
        parts.push({ start: survivorStart, base: lastBase });
      }
      for (const segment of this.segments) {
        if (segment.start > last) {
          const next = { start: segment.start + net, base: segment.base };
          const tail = parts[parts.length - 1] as LineSegment;
          if (next.start > tail.start && next.base !== tail.base) {
            parts.push(next);
          }
        }
      }
    }
    this.segments = parts;
  }

  // Applies the pending bases to the chunk lines and resets the list. This is
  // the only path that rewrites chunk line fields in bulk.
  private compactSegments(): void {
    if (this.segments.length <= MAX_LINE_SEGMENTS) {
      return;
    }
    let current = 0;
    for (let index = 0; index < this.chunks.length; index += 1) {
      while (current + 1 < this.segments.length &&
        (this.segments[current + 1] as LineSegment).start <= index) {
        current += 1;
      }
      const base = (this.segments[current] as LineSegment).base;
      if (base === 0) {
        continue;
      }
      const chunk = this.chunks[index] as RenderChunk;
      chunk.startLine += base;
      chunk.endLine += base;
      this.lineWrites += 1;
    }
    this.segments = [{ start: 0, base: 0 }];
  }

  private lineShiftAnchor(first: number, inserted: readonly RenderChunk[]): string | null {
    const tail = first + inserted.length;
    if (inserted.length > 0) {
      return (inserted[inserted.length - 1] as RenderChunk).id;
    }
    return tail > 0 ? (this.chunks[tail - 1] as RenderChunk).id : null;
  }

  // The dirty set holds a few chunks per keystroke, so an identity scan keeps
  // the lookup simple without touching chunk line fields.
  private indexOf(chunk: RenderChunk): number {
    return this.chunks.indexOf(chunk);
  }

  private newChunk(startLine: number, endLine: number): RenderChunk {
    const chunk: RenderChunk = {
      id: `block-${String(this.nextId)}`,
      startLine,
      endLine,
      rendered: false,
      html: null,
      labels: new Set(),
      definitionCandidate: false,
    };
    this.nextId += 1;
    this.unrendered += 1;
    this.lineWrites += 1;
    return chunk;
  }

  private send(chunk: RenderChunk, index: number): RenderBlock {
    const prepared = this.prepare(chunk, index);
    this.commit(chunk, prepared);
    return prepared.block;
  }

  private prepare(chunk: RenderChunk, index: number): PreparedBlock {
    const startLine = this.startOf(index);
    const endLine = this.endOf(index);
    const source = sourceOf(textReader(this.document), startLine, endLine);
    const html = this.renderText(source, this.environment());
    return {
      block: {
        id: chunk.id,
        startLine,
        endLine,
        html: shiftChunkDataLines(html, startLine),
      },
      html,
      labels: referenceLabels(source),
    };
  }

  private commit(chunk: RenderChunk, prepared: PreparedBlock): void {
    chunk.labels = prepared.labels;
    chunk.rendered = true;
    this.unrendered -= 1;
    chunk.html = prepared.html;
    this.dirty.delete(chunk);
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
    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index] as RenderChunk;
      if (!chunk.definitionCandidate) {
        continue;
      }
      const definitions = collectReferences(
        sourceOf(textReader(this.document), this.startOf(index), this.endOf(index)),
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
    this.pendingBlock = null;
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
        chunk.labels = new Set();
        this.unrendered += 1;
        this.dirty.add(chunk);
      }
    }
  }
}
