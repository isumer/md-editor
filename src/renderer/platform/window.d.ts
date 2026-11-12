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
  SettingsReadResponse,
  SettingsWriteRequest,
  SettingsWriteResponse,
} from "../../shared/ipc/settings";
import type {
  ChooseWorkspaceRootResponse,
  ListWorkspaceChildrenResponse,
  OpenWorkspaceFileResponse,
  WorkspacePathRequest,
} from "../../shared/ipc/workspace";
import type { ExportDocumentRequest } from "../../shared/ipc/export";

interface Api {
  exportDocument(request: ExportDocumentRequest): Promise<Result<void>>;
  openFile(): Promise<Result<DocumentReference | null>>;
  chooseSaveTarget(request: ChooseSaveTargetRequest): Promise<Result<DocumentReference | null>>;
  readDocument(grant: string): Promise<Result<ReadDocumentResponse>>;
  attachDocument(request: AttachDocumentInput): Promise<Result<void>>;
  saveDocument(request: SaveDocumentInput): Promise<Result<SaveDocumentResponse>>;
  draftDocument(request: DraftDocumentInput): Promise<Result<void>>;
  listDrafts(): Promise<Result<ListDraftsResponse>>;
  clearDraft(request: Omit<ClearDraftMessage, "op">): void;
  sendChanges(request: Omit<ChangeDocumentMessage, "op">): void;
  detachDocument(request: Omit<DetachDocumentMessage, "op">): void;
  releaseDocument(request: ReleaseDocumentRequest): Promise<Result<void>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommandMessage) => void): () => void;
  contributeMenu(request: MenuContribution): Promise<Result<void>>;
  onOpenRequest(listener: (request: Result<DocumentReference>) => void): () => void;
  loadSession(): Promise<Result<SessionLoadResponse>>;
  loadSettings(): Promise<Result<SettingsReadResponse>>;
  saveSettings(settings: SettingsWriteRequest): Promise<Result<SettingsWriteResponse>>;
  respondSessionClose(result: SessionCloseResult): Promise<Result<void>>;
  onSessionCloseRequest(listener: (request: SessionCloseRequest) => void): () => void;
  chooseWorkspaceRoot(): Promise<Result<ChooseWorkspaceRootResponse>>;
  listWorkspaceChildren(request: WorkspacePathRequest): Promise<
    Result<ListWorkspaceChildrenResponse>
  >;
  openWorkspaceFile(request: WorkspacePathRequest): Promise<
    Result<OpenWorkspaceFileResponse>
  >;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
