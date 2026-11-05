import { EditorState, Text, type ChangeSet } from "@codemirror/state";

import type { ChangeDocumentMessage } from "../../shared/ipc/io";
import type { ReplicatedVersion } from "./replication";

export type DocumentEol = "lf" | "crlf";

export interface DocumentSaved {
  bom: boolean;
  encoding: string;
  eol: DocumentEol;
  text: Text;
  version: number;
}

export interface DocumentRecord {
  bom: boolean;
  canonicalPath: string | null;
  dirty: boolean;
  encoding: string;
  eol: DocumentEol;
  grant: string | null;
  id: string;
  language: string;
  name: string | null;
  readOnly: boolean;
  replication: DocumentReplicationLike;
  saved: DocumentSaved;
  scrollTop: number;
  state: EditorState;
}

// Only the parts of DocumentReplication the document record needs.
export interface DocumentReplicationLike {
  current(): ReplicatedVersion;
  changed(changes: ChangeSet): ChangeDocumentMessage;
}

export interface NewDocumentInput {
  bom?: boolean;
  canonicalPath?: string | null;
  encoding?: string;
  eol?: DocumentEol;
  grant?: string | null;
  language?: string;
  name?: string | null;
  readOnly?: boolean;
  replication: DocumentReplicationLike;
  savedText: Text;
  state: EditorState;
  version?: number;
}

export function createDocumentRecord(input: NewDocumentInput): DocumentRecord {
  const record: DocumentRecord = {
    bom: input.bom ?? false,
    canonicalPath: input.canonicalPath ?? null,
    dirty: false,
    encoding: input.encoding ?? "utf-8",
    eol: input.eol ?? "lf",
    grant: input.grant ?? null,
    // The replication id is stable for the document's lifetime.
    id: input.replication.current().docId,
    language: input.language ?? "markdown",
    name: input.name ?? null,
    readOnly: input.readOnly ?? false,
    replication: input.replication,
    saved: {
      bom: input.bom ?? false,
      encoding: input.encoding ?? "utf-8",
      eol: input.eol ?? "lf",
      text: input.savedText,
      version: input.version ?? 0,
    },
    scrollTop: 0,
    state: input.state,
  };
  record.dirty = isDocumentDirty(record);
  return record;
}

// Text.eq short-circuits on shape and shared subtrees, so this never flattens
// either document on the edit path.
export function isDocumentDirty(
  document: Pick<DocumentRecord, "bom" | "encoding" | "eol" | "saved" | "state">,
): boolean {
  return !document.state.doc.eq(document.saved.text) ||
    document.encoding !== document.saved.encoding ||
    document.eol !== document.saved.eol ||
    document.bom !== document.saved.bom;
}

export function setDocumentEol(
  document: DocumentRecord,
  eol: DocumentEol,
): void {
  document.eol = eol;
  document.dirty = isDocumentDirty(document);
}

export function markDocumentSaved(
  document: DocumentRecord,
  text: Text,
  version: number,
): void {
  document.saved = {
    bom: document.bom,
    encoding: document.encoding,
    eol: document.eol,
    text,
    version,
  };
  // An edit during the save must keep the document dirty.
  document.dirty = isDocumentDirty(document);
}

export interface DocumentState {
  currentGrant: string | null;
  currentName: string | null;
  dirty: boolean;
  applyingDocument: boolean;
  productName: string;
  saved: Text;
}

export function createDocumentState(): DocumentState {
  return {
    currentGrant: null,
    currentName: null,
    dirty: false,
    applyingDocument: false,
    productName: "",
    saved: Text.empty,
  };
}

export function documentTitle(state: DocumentState): string {
  const name = state.currentName ?? "Untitled";
  return `${state.dirty ? "• " : ""}${name}${
    state.productName ? ` — ${state.productName}` : ""
  }`;
}

// Errors raised without a file name (a restarted file service) name the file the renderer asked about.
export function messageParams(
  params: Readonly<Record<string, string>>,
  fileName: string | null,
): Readonly<Record<string, string>> {
  return { file: fileName ?? "Untitled", ...params };
}

interface ReplacementInput {
  currentGrant: string | null;
  newGrant: string;
  dirty: boolean;
  confirmDiscard(): boolean;
  release(grant: string): Promise<void>;
}

export async function settleDocumentReplacement(
  input: ReplacementInput,
): Promise<boolean> {
  const accepted = !input.dirty || input.confirmDiscard();
  const releasedGrant = accepted ? input.currentGrant : input.newGrant;
  if (releasedGrant) {
    await input.release(releasedGrant);
  }
  return accepted;
}
