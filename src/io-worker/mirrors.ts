import { ChangeSet, Text } from "@codemirror/state";

import type { ChangeSetJson } from "../shared/ipc/io";
import { serviceError } from "../shared/ipc/result";
import { DocumentMirror } from "../shared/replication/mirror";

const MAX_DOCUMENTS_PER_WINDOW = 64;

function applyChanges(document: Text, changes: ChangeSetJson): Text {
  return ChangeSet.fromJSON(changes).apply(document);
}

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

export class IoMirrors {
  private readonly windows = new Map<number, DocumentMirror<Text, ChangeSetJson>>();

  attach(
    windowId: number,
    input: { docId: string; epoch: number; version: number; text: string },
  ): void {
    const mirror = this.mirror(windowId);
    if (!mirror.has(input.docId) && mirror.size >= MAX_DOCUMENTS_PER_WINDOW) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    mirror.attach(input.docId, input.epoch, input.version, text(input.text));
  }

  change(
    windowId: number,
    input: {
      docId: string;
      epoch: number;
      fromVersion: number;
      toVersion: number;
      changes: ChangeSetJson;
    },
  ): void {
    const mirror = this.windows.get(windowId);
    if (!mirror || (!mirror.has(input.docId) && mirror.size >= MAX_DOCUMENTS_PER_WINDOW)) {
      return;
    }
    mirror.change(
      input.docId,
      input.epoch,
      input.fromVersion,
      input.toVersion,
      input.changes,
    );
  }

  detach(windowId: number, docId: string): void {
    const mirror = this.windows.get(windowId);
    mirror?.detach(docId);
    if (mirror?.size === 0) {
      this.windows.delete(windowId);
    }
  }

  docAt(windowId: number, docId: string, epoch: number, version: number): Text | undefined {
    return this.windows.get(windowId)?.docAt(docId, epoch, version);
  }

  revokeWindow(windowId: number): void {
    this.windows.delete(windowId);
  }

  private mirror(windowId: number): DocumentMirror<Text, ChangeSetJson> {
    const mirror = this.windows.get(windowId) ??
      new DocumentMirror<Text, ChangeSetJson>(applyChanges);
    this.windows.set(windowId, mirror);
    return mirror;
  }
}
