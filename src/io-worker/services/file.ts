import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { atomicWrite } from "../../node-shared/atomicWrite";
import { resolvePathUnderRoot } from "../../node-shared/pathPolicy";
import type {
  AttachDocumentInput,
  ChangeDocumentMessage,
  DraftDocument,
  DraftDocumentInput,
  SaveDocumentInput,
} from "../../shared/ipc/io";
import type { ResolvedAsset } from "../../shared/ipc/ioControl";
import { serviceError, toServiceError } from "../../shared/ipc/result";
import { IoGrantTable } from "../grants";
import { IoMirrors } from "../mirrors";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;
}

function errorCause(error: unknown): unknown {
  let current = error;
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
  }
  return current;
}

function fileError(error: unknown, filePath: string): never {
  throw toServiceError(errorCause(error), {
    file: path.basename(filePath) || filePath,
  });
}

async function canonicalPath(filePath: string, mustExist: boolean): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (!mustExist && errorCode(error) === "ENOENT") {
      return absolutePath;
    }
    return fileError(error, filePath);
  }
}

async function ensureWritable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, constants.W_OK);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      fileError(error, filePath);
    }
  }
}

export class IoFileService {
  private readonly mirrors = new IoMirrors();
  // Drafts outlive a renderer reload: only an explicit window close clears them.
  private readonly drafts = new Map<number, Map<string, DraftDocument>>();

  constructor(private readonly grants: IoGrantTable) {}

  async registerGrant(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
  ): Promise<{ canonicalPath: string; name: string }> {
    const canonical = await canonicalPath(filePath, mustExist);
    this.grants.register(windowId, handle, canonical);
    return { canonicalPath: canonical, name: path.basename(canonical) };
  }

  async resolveAsset(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<ResolvedAsset> {
    const documentPath = this.grants.resolve(windowId, grant);
    const resolved = await resolvePathUnderRoot(
      path.dirname(documentPath),
      relativePath,
    );
    if (resolved.ok) {
      return { path: resolved.path };
    }
    if (resolved.reason === "io") {
      throw toServiceError(resolved.error, {
        file: path.basename(relativePath),
      });
    }
    throw serviceError("BAD_REQUEST", "request.invalid");
  }

  async read(
    windowId: number,
    grant: string,
  ): Promise<{ canonicalPath: string; name: string; text: string }> {
    const filePath = this.grants.resolve(windowId, grant);
    try {
      return {
        canonicalPath: filePath,
        name: path.basename(filePath),
        text: await fs.readFile(filePath, "utf8"),
      };
    } catch (error) {
      return fileError(error, filePath);
    }
  }

  attach(windowId: number, input: AttachDocumentInput): void {
    this.mirrors.attach(windowId, input);
  }

  change(windowId: number, input: Omit<ChangeDocumentMessage, "op">): void {
    this.mirrors.change(windowId, input);
  }

  detach(windowId: number, docId: string): void {
    this.mirrors.detach(windowId, docId);
    this.drafts.get(windowId)?.delete(docId);
  }

  resetWindow(windowId: number): void {
    this.mirrors.revokeWindow(windowId);
  }

  revokeWindow(windowId: number): void {
    this.mirrors.revokeWindow(windowId);
    this.drafts.delete(windowId);
  }

  // Serialised on the worker thread from the worker's mirror, never from a
  // renderer string.
  draft(windowId: number, input: DraftDocumentInput): void {
    const document = this.mirrors.docAt(
      windowId,
      input.docId,
      input.epoch,
      input.version,
    );
    if (!document) {
      throw serviceError("OUT_OF_SYNC", "file.outOfSync", {}, true);
    }
    if (input.grant !== null) {
      this.grants.resolve(windowId, input.grant);
    }
    const drafts = this.drafts.get(windowId) ?? new Map<string, DraftDocument>();
    drafts.set(input.docId, {
      docId: input.docId,
      grant: input.grant,
      text: document.toString(),
    });
    this.drafts.set(windowId, drafts);
  }

  listDrafts(windowId: number): { drafts: readonly DraftDocument[] } {
    return { drafts: [...(this.drafts.get(windowId)?.values() ?? [])] };
  }

  clearDraft(windowId: number, docId: string): void {
    this.drafts.get(windowId)?.delete(docId);
  }

  async save(
    windowId: number,
    input: SaveDocumentInput,
  ): Promise<{ name: string; version: number }> {
    const filePath = this.grants.resolve(windowId, input.grant);
    const document = this.mirrors.docAt(
      windowId,
      input.docId,
      input.epoch,
      input.version,
    );
    if (!document) {
      throw serviceError("OUT_OF_SYNC", "file.outOfSync", {}, true);
    }
    try {
      await ensureWritable(filePath);
      await atomicWrite(filePath, document.toString());
      this.drafts.get(windowId)?.delete(input.docId);
      return { name: path.basename(filePath), version: input.version };
    } catch (error) {
      return fileError(error, filePath);
    }
  }
}
