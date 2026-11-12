import type { EditorState, Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { DocumentReference } from "../../shared/ipc/file";
import type { DocumentRecord } from "../core/document";

export interface FeatureRewriteContext {
  readonly grant: string | null;
  readonly windowId: number | null;
}

export interface FeatureContext {
  readonly editor: EditorView;
  readonly editorHost: HTMLElement;
  readonly preview: HTMLElement;
  readonly workspace: HTMLElement;
  documents(): readonly DocumentRecord[];
  hasDocument(documentId: string): boolean;
  isActive(document: DocumentRecord): boolean;
  openDocument(reference: DocumentReference): Promise<void>;
  removeDocument(document: DocumentRecord): void;
  showStatus(message?: string): void;
}

export interface FeatureHooks {
  readonly commands?: Readonly<Record<string, () => void>>;
  start?(): void;
  documentActivated?(document: DocumentRecord): void;
  documentCreated?(document: DocumentRecord, source: string): void;
  documentRemoved?(documentId: string): void;
  documentStateChanged?(documentId: string | null, state: EditorState): void;
}

export interface FeatureRegistration {
  readonly editorExtensions: readonly Extension[];
  create(context: FeatureContext): FeatureHooks;
  rewriteHtml?(html: string, context: FeatureRewriteContext): string;
}

export interface InstalledFeatures {
  start(): void;
  documentActivated(document: DocumentRecord): void;
  documentCreated(document: DocumentRecord, source: string): void;
  documentRemoved(documentId: string): void;
  documentStateChanged(documentId: string | null, state: EditorState): void;
  runCommand(commandId: string): void;
}
