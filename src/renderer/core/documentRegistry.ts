import type { DocumentRecord } from "./document";

// One document per canonical path. The registry is the renderer's view of the
// app-wide rule; main mirrors it with grants.
export class DocumentRegistry {
  private readonly byId = new Map<string, DocumentRecord>();
  private readonly pathToId = new Map<string, string>();

  add(document: DocumentRecord): void {
    this.byId.set(document.id, document);
    if (document.canonicalPath) {
      this.pathToId.set(document.canonicalPath, document.id);
    }
  }

  get(id: string): DocumentRecord | undefined {
    return this.byId.get(id);
  }

  findByPath(canonicalPath: string): DocumentRecord | undefined {
    const id = this.pathToId.get(canonicalPath);
    return id === undefined ? undefined : this.byId.get(id);
  }

  remove(id: string): DocumentRecord | undefined {
    const document = this.byId.get(id);
    if (!document) {
      return undefined;
    }
    this.byId.delete(id);
    if (document.canonicalPath && this.pathToId.get(document.canonicalPath) === id) {
      this.pathToId.delete(document.canonicalPath);
    }
    return document;
  }

  adoptPath(id: string, canonicalPath: string): void {
    const document = this.byId.get(id);
    if (!document) {
      return;
    }
    if (document.canonicalPath &&
      this.pathToId.get(document.canonicalPath) === id) {
      this.pathToId.delete(document.canonicalPath);
    }
    document.canonicalPath = canonicalPath;
    this.pathToId.set(canonicalPath, id);
  }

  all(): readonly DocumentRecord[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }
}
