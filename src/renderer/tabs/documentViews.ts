import type { EditorSelection } from "@codemirror/state";

export type DocumentViewId = 1 | 2;

export interface DocumentViewState {
  readonly scrollTop: number;
  readonly selection: EditorSelection;
}

export class DocumentViews {
  private readonly members: Record<DocumentViewId, string[]> = {
    1: [],
    2: [],
  };
  private readonly states: Record<DocumentViewId, Map<string, DocumentViewState>> = {
    1: new Map(),
    2: new Map(),
  };

  constructor(documents: readonly string[] = []) {
    this.members[1] = [...documents];
  }

  documents(view: DocumentViewId): readonly string[] {
    return this.members[view];
  }

  add(documentId: string): void {
    const documents = this.members[1];
    if (!documents.includes(documentId)) {
      documents.push(documentId);
    }
  }

  move(documentId: string, from: DocumentViewId): void {
    const target = from === 1 ? 2 : 1;
    this.removeFrom(documentId, from);
    this.addTo(documentId, target);
  }

  clone(documentId: string, from: DocumentViewId): void {
    this.addTo(documentId, from === 1 ? 2 : 1);
  }

  remove(documentId: string): void {
    this.removeFrom(documentId, 1);
    this.removeFrom(documentId, 2);
    this.states[1].delete(documentId);
    this.states[2].delete(documentId);
  }

  saveState(
    documentId: string,
    view: DocumentViewId,
    state: DocumentViewState,
  ): void {
    this.states[view].set(documentId, state);
  }

  state(documentId: string, view: DocumentViewId): DocumentViewState | undefined {
    return this.states[view].get(documentId);
  }

  private addTo(documentId: string, view: DocumentViewId): void {
    const documents = this.members[view];
    if (!documents.includes(documentId)) {
      documents.push(documentId);
    }
  }

  private removeFrom(documentId: string, view: DocumentViewId): void {
    const documents = this.members[view];
    const index = documents.indexOf(documentId);
    if (index >= 0) {
      documents.splice(index, 1);
    }
  }
}
