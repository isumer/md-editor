import type { ChangeSet, Text } from "@codemirror/state";

import type { ChangeDocumentMessage } from "../../shared/ipc/io";

export interface ReplicatedVersion {
  docId: string;
  epoch: number;
  version: number;
}

export class DocumentReplication {
  private documentNumber = 1;
  private epochNumber = 1;
  private currentVersion: ReplicatedVersion = {
    docId: "document-1",
    epoch: 1,
    version: 0,
  };

  current(): ReplicatedVersion {
    return { ...this.currentVersion };
  }

  changed(changes: ChangeSet): ChangeDocumentMessage {
    const fromVersion = this.currentVersion.version;
    this.currentVersion = {
      ...this.currentVersion,
      version: fromVersion + 1,
    };
    return {
      op: "change",
      docId: this.currentVersion.docId,
      epoch: this.currentVersion.epoch,
      fromVersion,
      toVersion: this.currentVersion.version,
      changes: changes.toJSON(),
    };
  }

  replace(): { detachedDocId: string; current: ReplicatedVersion } {
    const detachedDocId = this.currentVersion.docId;
    this.documentNumber += 1;
    this.epochNumber += 1;
    this.currentVersion = {
      docId: `document-${this.documentNumber}`,
      epoch: this.epochNumber,
      version: 0,
    };
    return { detachedDocId, current: this.current() };
  }
}

type OperationResult<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

interface SaveValue {
  name: string;
  version: number;
}

interface SaveReplicatedInput<E> {
  grant: string;
  document: Text;
  version: ReplicatedVersion;
  attach(input: ReplicatedVersion & { text: string }): Promise<OperationResult<void, E>>;
  save(input: ReplicatedVersion & { grant: string }): Promise<OperationResult<SaveValue, E>>;
}

export async function saveReplicatedDocument<E extends { code: string }>(
  input: SaveReplicatedInput<E>,
): Promise<OperationResult<SaveValue, E>> {
  const request = { grant: input.grant, ...input.version };
  const first = await input.save(request);
  if (first.ok || first.error.code !== "OUT_OF_SYNC") {
    return first;
  }
  const attached = await input.attach({
    ...input.version,
    text: input.document.toString(),
  });
  if (!attached.ok) {
    return attached;
  }
  return input.save(request);
}
