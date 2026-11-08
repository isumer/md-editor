import { Text } from "@codemirror/state";

import type { DocumentReference } from "../../shared/ipc/file";
import type { DraftDocument } from "../../shared/ipc/io";
import type { Result } from "../../shared/ipc/result";
import type { SessionCloseRequest } from "../../shared/ipc/session";
import { formatMessage } from "../../shared/messages/en";
import { resolveClosePrompt } from "../core/closePrompt";
import { markDocumentSaved, messageParams, type DocumentRecord } from "../core/document";
import type { DocumentRegistry } from "../core/documentRegistry";
import type { DraftScheduler } from "../core/draftScheduler";
import { saveReplicatedDocument, type ReplicatedVersion } from "../core/replication";
import {
  attachDocument,
  chooseSaveTarget,
  clearDraft,
  draftDocument,
  listDrafts,
  loadSession,
  openFile,
  readDocument,
  releaseDocument,
  respondSessionClose,
  saveDocument as saveDocumentVersion,
} from "../platform/api";
import type { DocumentClosePrompt } from "./closePrompt";
import { tabLabel } from "./tabStrip";

interface NewDocumentInput {
  canonicalPath: string | null;
  grant: string | null;
  name: string | null;
  savedText: string;
  text: string;
}

export interface DocumentLifecycleOptions {
  active(): DocumentRecord | null;
  activate(document: DocumentRecord): void;
  drafts: DraftScheduler;
  flushDirty(): void;
  newDocument(input: NewDocumentInput): DocumentRecord;
  prompt: DocumentClosePrompt;
  registry: DocumentRegistry;
  remove(document: DocumentRecord): void;
  removePristineUntitled(): void;
  showStatus(message?: string): void;
  syncDirty(document: DocumentRecord): void;
}

interface SaveSnapshot {
  document: Text;
  version: ReplicatedVersion;
}

export function sessionSnapshot(documents: readonly DocumentRecord[]): {
  grant: string;
  name: string;
  savedText: string;
  text: string;
}[] {
  return documents.flatMap((document) => document.grant === null ? [] : [{
    grant: document.grant,
    name: tabLabel(document),
    savedText: document.saved.text.toString(),
    text: document.state.doc.toString(),
  }]);
}

export class DocumentLifecycle {
  private readonly inFlightSavePaths = new Set<string>();

  constructor(private readonly options: DocumentLifecycleOptions) {}

  async open(): Promise<void> {
    try {
      const opened = this.value(await openFile());
      if (opened) {
        await this.openReference(opened);
      }
    } catch (error) {
      this.unexpected(error);
    }
  }

  async openReference(reference: DocumentReference): Promise<void> {
    const existing = this.options.registry.findByPath(reference.canonicalPath);
    if (existing) {
      this.options.activate(existing);
      await this.releaseGrant(reference.grant);
      return;
    }
    const read = this.value(await readDocument(reference.grant), reference.name);
    if (!read) {
      await this.releaseGrant(reference.grant);
      return;
    }
    const raced = this.options.registry.findByPath(read.canonicalPath);
    if (raced) {
      this.options.activate(raced);
      await this.releaseGrant(reference.grant);
      return;
    }
    if (this.inFlightSavePaths.has(read.canonicalPath)) {
      await this.releaseGrant(reference.grant);
      this.options.showStatus(formatMessage("file.openInFlight", { file: read.name }));
      return;
    }
    const document = this.options.newDocument({
      canonicalPath: read.canonicalPath,
      grant: reference.grant,
      name: reference.name,
      savedText: read.text,
      text: read.text,
    });
    this.options.removePristineUntitled();
    this.options.activate(document);
  }

  handleOpenRequest(request: Result<DocumentReference>): void {
    const opened = this.value(request);
    if (opened) {
      void this.openReference(opened).catch((error: unknown) => this.unexpected(error));
    }
  }

  async closeTab(document: DocumentRecord): Promise<void> {
    this.options.flushDirty();
    if (document.dirty) {
      const answer = await this.options.prompt.ask([document]);
      const resolution = resolveClosePrompt(true, answer);
      if (resolution === "cancel") {
        return;
      }
      if (resolution === "save" && !(await this.save(document, false))) {
        return;
      }
    }
    this.options.remove(document);
  }

  async saveActive(saveAs: boolean): Promise<void> {
    const document = this.options.active();
    if (document) {
      await this.save(document, saveAs);
    }
  }

  async save(document: DocumentRecord, saveAs: boolean): Promise<boolean> {
    const snapshot = {
      document: document.state.doc,
      version: document.replication.current(),
    };
    try {
      if (!saveAs && document.grant) {
        return await this.saveCurrent(document, snapshot, document.grant);
      }
      return await this.saveNew(document, snapshot);
    } catch (error) {
      this.unexpected(error);
      return false;
    }
  }

  sendDraft(docId: string): void {
    const document = this.options.registry.get(docId);
    if (!document || !document.dirty) {
      return;
    }
    const version = document.replication.current();
    void draftDocument({ grant: document.grant, ...version }).then((result) => {
      if (!result.ok && result.error.code !== "OUT_OF_SYNC") {
        this.value(result, document.name);
      }
    }).catch((error: unknown) => this.unexpected(error));
  }

  async handleSessionClose(request: SessionCloseRequest): Promise<void> {
    this.options.flushDirty();
    const dirty = this.options.registry.all().filter((document) => document.dirty);
    const allow = await this.confirmClose(dirty);
    const result = await respondSessionClose({
      allow,
      documents: allow ? sessionSnapshot(this.options.registry.all()) : [],
      id: request.id,
    });
    this.value(result);
  }

  async recover(): Promise<boolean> {
    const listed = await listDrafts();
    if (!listed.ok) {
      return false;
    }
    let recovered = false;
    for (const draft of listed.value.drafts) {
      recovered = (await this.recoverDraft(draft)) || recovered;
    }
    return recovered;
  }

  async restoreSession(): Promise<void> {
    const session = await loadSession();
    if (!session.ok) {
      return;
    }
    for (const stored of session.value.documents) {
      const read = await readDocument(stored.grant);
      if (!read.ok || this.options.registry.findByPath(read.value.canonicalPath)) {
        await this.discardGrant(stored.grant);
        continue;
      }
      const document = this.options.newDocument({
        canonicalPath: read.value.canonicalPath,
        grant: stored.grant,
        name: read.value.name,
        savedText: stored.savedText,
        text: stored.text,
      });
      this.options.removePristineUntitled();
      this.options.activate(document);
    }
  }

  async releaseGrant(grant: string): Promise<void> {
    this.value(await releaseDocument({ grant }));
  }

  private async discardGrant(grant: string): Promise<void> {
    // The grant belongs to no document; a failed release here is a normal race, not an error.
    await releaseDocument({ grant });
  }

  private async confirmClose(documents: readonly DocumentRecord[]): Promise<boolean> {
    if (documents.length === 0) {
      return true;
    }
    const resolution = resolveClosePrompt(true, await this.options.prompt.ask(documents));
    if (resolution === "cancel") {
      return false;
    }
    if (resolution === "save") {
      for (const document of documents) {
        if (!(await this.save(document, false))) {
          return false;
        }
      }
    }
    return true;
  }

  private markSaved(document: DocumentRecord, text: Text, version: number): void {
    markDocumentSaved(document, text, version);
    if (document.dirty) {
      this.options.drafts.documentChanged(document.id, document.state.doc.length);
    } else {
      this.options.drafts.documentSaved(document.id);
      clearDraft({ docId: document.id });
    }
    this.options.syncDirty(document);
  }

  private async saveSnapshot(
    document: DocumentRecord,
    snapshot: SaveSnapshot,
    grant: string,
    fileName: string | null,
  ): Promise<string | undefined> {
    const saved = this.value(await saveReplicatedDocument({
      grant,
      document: snapshot.document,
      version: snapshot.version,
      attach: attachDocument,
      save: saveDocumentVersion,
    }), fileName);
    if (!saved) {
      return undefined;
    }
    this.markSaved(document, snapshot.document, saved.version);
    this.options.showStatus();
    return saved.name;
  }

  private async saveCurrent(
    document: DocumentRecord,
    snapshot: SaveSnapshot,
    grant: string,
  ): Promise<boolean> {
    const name = await this.saveSnapshot(document, snapshot, grant, document.name);
    if (!name) {
      return false;
    }
    document.name = name;
    this.options.syncDirty(document);
    return true;
  }

  private async saveNew(document: DocumentRecord, snapshot: SaveSnapshot): Promise<boolean> {
    const target = this.value(await chooseSaveTarget({ grant: document.grant }));
    if (!target) {
      return false;
    }
    const owner = this.options.registry.findByPath(target.canonicalPath);
    if (owner && owner.id !== document.id) {
      await this.releaseGrant(target.grant);
      this.options.showStatus(formatMessage("file.alreadyOpen", { file: target.name }));
      return false;
    }
    if (this.inFlightSavePaths.has(target.canonicalPath)) {
      await this.releaseGrant(target.grant);
      this.options.showStatus(formatMessage("file.saveInFlight", { file: target.name }));
      return false;
    }
    this.inFlightSavePaths.add(target.canonicalPath);
    let name: string | undefined;
    try {
      name = await this.saveSnapshot(document, snapshot, target.grant, target.name);
    } catch (error) {
      this.inFlightSavePaths.delete(target.canonicalPath);
      await this.releaseGrant(target.grant);
      throw error;
    }
    if (!name) {
      this.inFlightSavePaths.delete(target.canonicalPath);
      await this.releaseGrant(target.grant);
      return false;
    }
    const previousGrant = document.grant;
    try {
      document.grant = target.grant;
      document.name = name;
      this.options.registry.adoptPath(document.id, target.canonicalPath);
      this.options.syncDirty(document);
    } finally {
      this.inFlightSavePaths.delete(target.canonicalPath);
    }
    if (previousGrant) {
      await this.releaseGrant(previousGrant);
    }
    return true;
  }

  private async recoverDraft(draft: DraftDocument): Promise<boolean> {
    if (draft.grant === null) {
      return this.addRecovered(draft, null, null, "", "Untitled");
    }
    const read = await readDocument(draft.grant);
    if (
      !read.ok
      || this.options.registry.findByPath(read.value.canonicalPath)
      || this.inFlightSavePaths.has(read.value.canonicalPath)
    ) {
      await this.discardGrant(draft.grant);
      return false;
    }
    return this.addRecovered(
      draft,
      read.value.canonicalPath,
      read.value.name,
      read.value.text,
      read.value.name,
    );
  }

  private addRecovered(
    draft: DraftDocument,
    canonicalPath: string | null,
    name: string | null,
    savedText: string,
    label: string,
  ): boolean {
    const document = this.options.newDocument({
      canonicalPath,
      grant: draft.grant,
      name,
      savedText,
      text: draft.text,
    });
    this.options.removePristineUntitled();
    this.options.activate(document);
    this.options.showStatus(formatMessage("draft.recovered", { file: label }));
    return true;
  }

  private value<T>(result: Result<T>, fileName: string | null = null): T | undefined {
    if (!result.ok) {
      this.options.showStatus(formatMessage(
        result.error.messageKey,
        messageParams(result.error.params, fileName),
      ));
      return undefined;
    }
    return result.value;
  }

  private unexpected(error: unknown): void {
    this.options.showStatus(error instanceof Error ? error.message : String(error));
  }
}
