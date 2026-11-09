import type {
  ChooseSaveTargetRequest,
  DocumentReference,
  OpenRequestReady,
  ReleaseDocumentRequest,
} from "../../shared/ipc/file";
import type {
  AttachDocumentInput,
  ChangeDocumentMessage,
  ClearDraftMessage,
  DetachDocumentMessage,
  DraftDocumentInput,
  ListDraftsResponse,
  ReadDocumentResponse,
  SaveDocumentInput,
  SaveDocumentResponse,
} from "../../shared/ipc/io";
import type {
  MenuCommandMessage,
  MenuContribution,
} from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";
import type {
  SessionCloseRequest,
  SessionCloseResult,
  SessionLoadResponse,
} from "../../shared/ipc/session";
import type {
  ChooseWorkspaceRootResponse,
  ListWorkspaceChildrenResponse,
  OpenWorkspaceFileResponse,
  WorkspacePathRequest,
} from "../../shared/ipc/workspace";

const api = window.api;

export function openFile(): Promise<Result<DocumentReference | null>> {
  return api.openFile();
}

export function loadSession(): Promise<Result<SessionLoadResponse>> {
  return api.loadSession();
}

export function respondSessionClose(result: SessionCloseResult): Promise<Result<void>> {
  return api.respondSessionClose(result);
}

export function onSessionCloseRequest(
  listener: (request: SessionCloseRequest) => void,
): () => void {
  return api.onSessionCloseRequest(listener);
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

export function draftDocument(request: DraftDocumentInput): Promise<Result<void>> {
  return api.draftDocument(request);
}

export function listDrafts(): Promise<Result<ListDraftsResponse>> {
  return api.listDrafts();
}

export function clearDraft(request: Omit<ClearDraftMessage, "op">): void {
  api.clearDraft(request);
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

export function chooseWorkspaceRoot(): Promise<Result<ChooseWorkspaceRootResponse>> {
  return api.chooseWorkspaceRoot();
}

export function listWorkspaceChildren(
  request: WorkspacePathRequest,
): Promise<Result<ListWorkspaceChildrenResponse>> {
  return api.listWorkspaceChildren(request);
}

export function openWorkspaceFile(
  request: WorkspacePathRequest,
): Promise<Result<OpenWorkspaceFileResponse>> {
  return api.openWorkspaceFile(request);
}
