import type {
  ChooseSaveTargetRequest,
  DocumentReference,
  OpenRequestReady,
  ReleaseDocumentRequest,
} from "../../shared/ipc/file";
import type {
  AttachDocumentInput,
  ChangeDocumentMessage,
  DetachDocumentMessage,
  ReadDocumentResponse,
  SaveDocumentInput,
  SaveDocumentResponse,
} from "../../shared/ipc/io";
import type {
  MenuCommandMessage,
  MenuContribution,
} from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";

const api = window.api;

export function openFile(): Promise<Result<DocumentReference | null>> {
  return api.openFile();
}

export function chooseSaveTarget(
  request: ChooseSaveTargetRequest,
): Promise<Result<DocumentReference | null>> {
  return api.chooseSaveTarget(request);
}

export function readDocument(grant: string): Promise<Result<ReadDocumentResponse>> {
  return api.readDocument(grant);
}

export function attachDocument(request: AttachDocumentInput): Promise<Result<void>> {
  return api.attachDocument(request);
}

export function saveDocument(
  request: SaveDocumentInput,
): Promise<Result<SaveDocumentResponse>> {
  return api.saveDocument(request);
}

export function sendChanges(request: Omit<ChangeDocumentMessage, "op">): void {
  api.sendChanges(request);
}

export function detachDocument(request: Omit<DetachDocumentMessage, "op">): void {
  api.detachDocument(request);
}

export function releaseDocument(request: ReleaseDocumentRequest): Promise<Result<void>> {
  return api.releaseDocument(request);
}

export function openExternal(url: string): Promise<Result<void>> {
  return api.openExternal(url);
}

export function readyForOpenRequests(): Promise<Result<OpenRequestReady>> {
  return api.readyForOpenRequests();
}

export function onMenuCommand(
  listener: (command: MenuCommandMessage) => void,
): () => void {
  return api.onMenuCommand(listener);
}

export function contributeMenu(
  request: MenuContribution,
): Promise<Result<void>> {
  return api.contributeMenu(request);
}

export function onOpenRequest(
  listener: (request: Result<DocumentReference>) => void,
): () => void {
  return api.onOpenRequest(listener);
}
