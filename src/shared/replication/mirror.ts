interface SyncedDocument<T> {
  state: "synced";
  epoch: number;
  version: number;
  document: T;
}

interface StaleDocument {
  state: "stale";
  epoch: number;
}

type MirroredDocument<T> = SyncedDocument<T> | StaleDocument;

export class DocumentMirror<T, C> {
  private readonly documents = new Map<string, MirroredDocument<T>>();

  constructor(private readonly apply: (document: T, changes: C) => T) {}

  get size(): number {
    return this.documents.size;
  }

  has(docId: string): boolean {
    return this.documents.has(docId);
  }

  attach(docId: string, epoch: number, version: number, document: T): void {
    const current = this.documents.get(docId);
    if (!current || epoch >= current.epoch) {
      this.documents.set(docId, {
        state: "synced",
        epoch,
        version,
        document,
      });
    }
  }

  change(
    docId: string,
    epoch: number,
    fromVersion: number,
    toVersion: number,
    changes: C,
  ): void {
    const current = this.documents.get(docId);
    if (current && epoch < current.epoch) {
      return;
    }
    if (!current || current.state === "stale" || epoch > current.epoch ||
      fromVersion !== current.version || toVersion !== fromVersion + 1) {
      this.documents.set(docId, { state: "stale", epoch });
      return;
    }
    try {
      this.documents.set(docId, {
        state: "synced",
        epoch,
        version: toVersion,
        document: this.apply(current.document, changes),
      });
    } catch {
      this.documents.set(docId, { state: "stale", epoch });
    }
  }

  detach(docId: string): void {
    this.documents.delete(docId);
  }

  docAt(docId: string, epoch: number, version: number): T | undefined {
    const current = this.documents.get(docId);
    return current?.state === "synced" && current.epoch === epoch &&
        current.version === version
      ? current.document
      : undefined;
  }
}
