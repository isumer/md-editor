import { ChangeSet, Text } from "@codemirror/state";

import type {
  RenderAttachMessage,
  RenderChangeMessage,
  RenderChangeSetJson,
  RenderFillReadyMessage,
  RenderRequest,
  RenderResponse,
  RenderResult,
  RenderShowMessage,
} from "../../../shared/workers/render";
import { isRenderWorkerRequest } from "../../../shared/workers/render";
import { DocumentMirror } from "../../../shared/replication/mirror";
import { renderMarkdown, type RenderEnvironment } from "./render";
import { IncrementalRenderState } from "./incremental";

interface BufferedResync {
  epoch: number;
  version: number;
  changes: RenderChangeMessage[];
}

interface CachedRender {
  state: IncrementalRenderState;
  request: RenderRequest | null;
  fillToken: number;
  fillTimer: ReturnType<typeof setTimeout> | undefined;
}

type PostResponse = (response: RenderResponse) => void;
type RenderText = (source: string, env?: RenderEnvironment) => string;

// The fill pass exists to keep input responsive: it must yield to the event
// loop between batches instead of flooding the main thread with appends. The
// preview acknowledges each applied batch, so at most one batch is in flight.
const FILL_DELAY_MS = 1;

function applyChanges(document: Text, changes: RenderChangeSetJson): Text {
  return ChangeSet.fromJSON(changes).apply(document);
}

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

export class RenderWorkerHandler {
  private readonly mirror = new DocumentMirror<Text, RenderChangeSetJson>(applyChanges);
  private readonly buffers = new Map<string, BufferedResync>();
  private readonly renders = new Map<string, CachedRender>();

  constructor(
    private readonly postResponse: PostResponse,
    private readonly renderText: RenderText = renderMarkdown,
  ) {}

  handle(value: unknown): void {
    if (!isRenderWorkerRequest(value)) {
      return;
    }
    switch (value.op) {
      case "attach":
        this.attach(value);
        return;
      case "change":
        this.change(value);
        return;
      case "render":
        this.render(value);
        return;
      case "show":
        this.show(value);
        return;
      case "detach":
        this.detach(value.docId);
        return;
      case "fill-ready":
        this.fillReady(value);
        return;
      case "reset":
        this.reset(value.docId);
        return;
      case "ping":
        this.postResponse({ op: "pong", id: value.id });
        return;
    }
  }

  private reset(docId: string): void {
    const cache = this.renders.get(docId);
    if (cache) {
      this.cancelFill(cache);
      this.renders.delete(docId);
    }
  }

  private attach(message: RenderAttachMessage): void {
    this.mirror.attach(
      message.docId,
      message.epoch,
      message.version,
      text(message.text),
    );
    const cache = this.renders.get(message.docId);
    if (cache && cache.state.epoch < message.epoch) {
      this.cancelFill(cache);
      this.renders.delete(message.docId);
    }
    const buffer = this.buffers.get(message.docId);
    if (!buffer || message.epoch < buffer.epoch ||
      (message.epoch === buffer.epoch && message.version < buffer.version)) {
      return;
    }
    this.buffers.delete(message.docId);
    if (message.epoch > buffer.epoch) {
      return;
    }
    for (const change of buffer.changes) {
      if (change.fromVersion >= message.version) {
        this.applyChange(change);
      }
    }
  }

  private change(message: RenderChangeMessage): void {
    const buffer = this.buffers.get(message.docId);
    if (!buffer) {
      this.applyChange(message);
      return;
    }
    if (message.epoch < buffer.epoch ||
      (message.epoch === buffer.epoch && message.fromVersion < buffer.version)) {
      return;
    }
    if (message.epoch === buffer.epoch) {
      buffer.changes.push(message);
      return;
    }
    this.buffers.delete(message.docId);
    this.applyChange(message);
  }

  private applyChange(message: RenderChangeMessage): void {
    const before = this.mirror.docAt(
      message.docId,
      message.epoch,
      message.fromVersion,
    );
    this.mirror.change(
      message.docId,
      message.epoch,
      message.fromVersion,
      message.toVersion,
      message.changes,
    );
    const after = this.mirror.docAt(
      message.docId,
      message.epoch,
      message.toVersion,
    );
    const cache = this.renders.get(message.docId);
    if (!cache) {
      return;
    }
    this.cancelFill(cache);
    if (!before || !after || cache.state.epoch !== message.epoch ||
      cache.state.version !== message.fromVersion) {
      this.renders.delete(message.docId);
      return;
    }
    cache.state.applyChange(
      before,
      after,
      message.fromVersion,
      message.toVersion,
      message.changes,
    );
  }

  private render(request: RenderRequest): void {
    const document = this.mirror.docAt(
      request.docId,
      request.epoch,
      request.version,
    );
    if (!document) {
      this.requestResync(request);
      return;
    }
    const cache = this.cachedRender(request, document);
    cache.request = request;
    try {
      this.cancelFill(cache);
      this.postResponse(this.resultFor(cache.state, request));
      this.scheduleFill(cache);
    } catch (error) {
      // A failed patch or fill may already have advanced the cache (rendered
      // chunks, moved cursor) without delivering their blocks. Rebuild the
      // state from the mirror on the next request so no delta is lost.
      this.cancelFill(cache);
      this.renders.delete(request.docId);
      this.postResponse({
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private show(request: RenderShowMessage): void {
    const cache = this.renders.get(request.docId);
    const batch = cache && cache.state.epoch === request.epoch &&
        cache.state.version === request.version
      ? cache.state.show()
      : null;
    if (!cache || !batch) {
      this.render({
        op: "render",
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
      });
      return;
    }
    this.cancelFill(cache);
    cache.request = {
      op: "render",
      id: request.id,
      docId: request.docId,
      epoch: request.epoch,
      version: request.version,
    };
    this.postResponse({
      id: request.id,
      docId: request.docId,
      epoch: request.epoch,
      version: request.version,
      ok: true,
      mode: "replace",
      blocks: batch.blocks,
      complete: batch.complete,
      cached: true,
    });
    this.scheduleFill(cache);
  }

  private cachedRender(request: RenderRequest, document: Text): CachedRender {
    const existing = this.renders.get(request.docId);
    if (existing && existing.state.epoch === request.epoch &&
      existing.state.version === request.version) {
      return existing;
    }
    if (existing) {
      this.cancelFill(existing);
    }
    const cache: CachedRender = {
      state: new IncrementalRenderState(
        request.docId,
        request.epoch,
        request.version,
        document,
        this.renderText,
      ),
      request: null,
      fillToken: 0,
      fillTimer: undefined,
    };
    this.renders.set(request.docId, cache);
    return cache;
  }

  private resultFor(
    state: IncrementalRenderState,
    request: RenderRequest,
  ): RenderResult {
    if (!state.published) {
      const batch = state.initial();
      return {
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
        ok: true,
        mode: "replace",
        blocks: batch.blocks,
        complete: batch.complete,
      };
    }
    const batch = state.patch();
    return {
      id: request.id,
      docId: request.docId,
      epoch: request.epoch,
      version: request.version,
      ok: true,
      mode: "patch",
      blocks: batch.blocks,
      removed: batch.removed,
      lineShifts: batch.lineShifts,
      complete: batch.complete,
    };
  }

  private scheduleFill(cache: CachedRender): void {
    if (cache.state.complete || cache.request === null) {
      return;
    }
    if (cache.fillTimer !== undefined) {
      return;
    }
    const token = cache.fillToken;
    cache.fillTimer = setTimeout(() => this.fillBatch(cache, token), FILL_DELAY_MS);
  }

  private fillBatch(cache: CachedRender, token: number): void {
    const request = cache.request;
    if (request === null || cache.fillToken !== token) {
      return;
    }
    cache.fillTimer = undefined;
    try {
      const batch = cache.state.fill();
      this.postResponse({
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
        ok: true,
        mode: "append",
        blocks: batch.blocks,
        fillToken: token,
        complete: batch.complete,
      });
    } catch (error) {
      // The batch advanced the cursor before failing, and its blocks cannot
      // be sent; discard the cache so the next render starts from a replace.
      this.cancelFill(cache);
      this.renders.delete(request.docId);
      this.postResponse({
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    // The next batch waits for the preview's acknowledgement, which bounds the
    // work queued on the main thread.
  }

  private fillReady(message: RenderFillReadyMessage): void {
    const cache = this.renders.get(message.docId);
    if (!cache || cache.state.epoch !== message.epoch ||
      cache.state.version !== message.version ||
      cache.fillToken !== message.token) {
      return;
    }
    this.scheduleFill(cache);
  }

  private cancelFill(cache: CachedRender): void {
    cache.fillToken += 1;
    if (cache.fillTimer !== undefined) {
      clearTimeout(cache.fillTimer);
      cache.fillTimer = undefined;
    }
  }

  private detach(docId: string): void {
    this.mirror.detach(docId);
    this.buffers.delete(docId);
    const cache = this.renders.get(docId);
    if (cache) {
      this.cancelFill(cache);
      this.renders.delete(docId);
    }
  }

  private requestResync(request: RenderRequest): void {
    this.postResponse({
      op: "resync",
      id: request.id,
      docId: request.docId,
      epoch: request.epoch,
      version: request.version,
    });
    const current = this.buffers.get(request.docId);
    if (!current || request.epoch > current.epoch) {
      this.buffers.set(request.docId, {
        epoch: request.epoch,
        version: request.version,
        changes: [],
      });
    }
  }
}
