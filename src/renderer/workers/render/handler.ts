import { ChangeSet, Text } from "@codemirror/state";

import type {
  RenderAttachMessage,
  RenderChangeMessage,
  RenderChangeSetJson,
  RenderRequest,
  RenderResponse,
} from "../../../shared/workers/render";
import { isRenderWorkerRequest } from "../../../shared/workers/render";
import { DocumentMirror } from "../../../shared/replication/mirror";
import { renderMarkdown } from "./render";

interface BufferedResync {
  epoch: number;
  version: number;
  changes: RenderChangeMessage[];
}

type PostResponse = (response: RenderResponse) => void;
type RenderText = (source: string) => string;

function applyChanges(document: Text, changes: RenderChangeSetJson): Text {
  return ChangeSet.fromJSON(changes).apply(document);
}

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

export class RenderWorkerHandler {
  private readonly mirror = new DocumentMirror<Text, RenderChangeSetJson>(applyChanges);
  private readonly buffers = new Map<string, BufferedResync>();

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
      case "detach":
        this.mirror.detach(value.docId);
        this.buffers.delete(value.docId);
        return;
    }
  }

  private attach(message: RenderAttachMessage): void {
    this.mirror.attach(
      message.docId,
      message.epoch,
      message.version,
      text(message.text),
    );
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
    this.mirror.change(
      message.docId,
      message.epoch,
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
    try {
      this.postResponse({
        id: request.id,
        docId: request.docId,
        epoch: request.epoch,
        version: request.version,
        ok: true,
        html: this.renderText(document.toString()),
      });
    } catch (error) {
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
