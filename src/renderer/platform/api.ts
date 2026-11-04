import type {
  ChooseSaveTargetRequest,
  DocumentReference,
  OpenRequestReady,
  ReleaseDocumentRequest,
} from "../../shared/ipc/file";
import type {
  ReadDocumentResponse,
  WriteDocumentResponse,
} from "../../shared/ipc/io";
import type { MenuCommand } from "../../shared/ipc/menu";
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

export function writeDocument(
  request: { grant: string; text: string },
): Promise<Result<WriteDocumentResponse>> {
  return api.writeDocument(request);
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
  listener: (command: MenuCommand) => void,
): () => void {
  return api.onMenuCommand(listener);
}

export function onOpenRequest(
  listener: (request: Result<DocumentReference>) => void,
): () => void {
  return api.onOpenRequest(listener);
}
