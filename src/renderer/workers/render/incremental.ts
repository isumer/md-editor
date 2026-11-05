import { ChangeSet, Text } from "@codemirror/state";

import type {
  RenderBlock,
  RenderBlockPatch,
  RenderChangeSetJson,
} from "../../../shared/workers/render";
import { rangeIndexAt, shiftDataLineAttributes, splitChunks } from "./chunks";

export type ChunkRenderer = (source: string) => string;

export interface RenderBatch {
  blocks: RenderBlock[];
  complete: boolean;
}

export interface PatchBatch {
  blocks: RenderBlockPatch[];
  removed: string[];
  complete: boolean;
}

interface RenderChunk {
  id: string;
  startLine: number;
  endLine: number;
  rendered: boolean;
}

export const INITIAL_CHUNK_COUNT = 40;
const FILL_BATCH_SIZE = 16;
const PROGRESSIVE_BYTES = 2 * 1024 * 1024;

function documentLines(document: Text): string[] {
  return document.toString().split("\n");
}

function sliceLines(document: Text, startLine: number, endLine: number): string[] {
  const start = startLine >= document.lines
    ? document.length
    : document.line(startLine + 1).from;
  const end = endLine >= document.lines
    ? document.length
    : document.line(endLine + 1).from;
  return document.slice(start, end).toString().split("\n");
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

export class IncrementalRenderState {
  version: number;
  document: Text;
  readonly progressive: boolean;
  published = false;
  private chunks: RenderChunk[];
  private cursor = 0;
  private readonly removed = new Set<string>();
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
    this.chunks = splitChunks(documentLines(document)).map((range) =>
      this.newChunk(range.startLine, range.endLine));
  }

  get complete(): boolean {
    return this.cursor >= this.chunks.length &&
      this.chunks.every((chunk) => chunk.rendered);
  }

  initial(): RenderBatch {
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
    const blocks: RenderBlockPatch[] = [];
    let previous: string | null = null;
    for (let index = 0; index < this.cursor; index += 1) {
      const chunk = this.chunks[index] as RenderChunk;
      if (!chunk.rendered) {
        blocks.push({ block: this.send(chunk), after: previous });
      }
      previous = chunk.id;
    }
    const removed = [...this.removed];
    this.removed.clear();
    return { blocks, removed, complete: this.complete };
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

    const changedStart = before.lineAt(bounds.from).number - 1;
    const changedEnd = before.lineAt(bounds.to).number;
    const startLine = this.blockStart(after, changedStart);
    const endLine = this.blockEnd(after, changedEnd + after.lines - before.lines);
    const first = this.firstChunkFor(startLine);
    const last = this.lastChunkFor(first, endLine - (after.lines - before.lines));
    const removedChunks = this.chunks.splice(first, last - first);
    for (const chunk of removedChunks) {
      if (chunk.rendered) {
        this.removed.add(chunk.id);
      }
    }

    const lineDelta = after.lines - before.lines;
    const replacements = splitChunks(sliceLines(after, startLine, endLine))
      .map((range) => this.newChunk(
        range.startLine + startLine,
        range.endLine + startLine,
      ));
    this.chunks.splice(first, 0, ...replacements);
    for (let index = first + replacements.length; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index] as RenderChunk;
      chunk.startLine += lineDelta;
      chunk.endLine += lineDelta;
    }
    if (first < this.cursor) {
      const tailCovered = Math.max(0, this.cursor - last);
      this.cursor = first + replacements.length + tailCovered;
    }
  }

  // Grow the changed line range to whole blank-line-delimited blocks so the
  // replacement window ends on a chunk boundary in the new document too.
  private blockStart(document: Text, line: number): number {
    let start = Math.max(0, Math.min(line, document.lines - 1));
    while (start > 0 && (document.line(start).text.trim() !== "")) {
      start -= 1;
    }
    return start;
  }

  private blockEnd(document: Text, line: number): number {
    let end = Math.max(0, Math.min(line, document.lines));
    while (end < document.lines && document.line(end + 1).text.trim() !== "") {
      end += 1;
    }
    return end;
  }

  private firstChunkFor(startLine: number): number {
    let first = rangeIndexAt(this.chunks, startLine);
    const chunk = this.chunks[first];
    if (first > 0 && (!chunk || chunk.startLine > startLine)) {
      first -= 1;
    }
    return first;
  }

  private lastChunkFor(first: number, endLine: number): number {
    let last = first;
    while (last < this.chunks.length) {
      const chunk = this.chunks[last] as RenderChunk;
      if (chunk.startLine >= endLine) {
        break;
      }
      last += 1;
    }
    return last;
  }

  private newChunk(startLine: number, endLine: number): RenderChunk {
    const chunk: RenderChunk = {
      id: `block-${String(this.nextId)}`,
      startLine,
      endLine,
      rendered: false,
    };
    this.nextId += 1;
    return chunk;
  }

  private send(chunk: RenderChunk): RenderBlock {
    chunk.rendered = true;
    return {
      id: chunk.id,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      html: shiftDataLineAttributes(
        this.renderText(this.sourceFor(chunk)),
        chunk.startLine,
      ),
    };
  }

  private sourceFor(chunk: RenderChunk): string {
    const lines = sliceLines(this.document, chunk.startLine, chunk.endLine);
    // sliceLines ends on the next line's start, so drop that boundary's empty tail.
    if (lines.length > 1 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.join("\n");
  }
}
