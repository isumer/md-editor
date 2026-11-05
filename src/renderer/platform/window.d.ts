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
import type { MenuCommand } from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";

interface Api {
  openFile(): Promise<Result<DocumentReference | null>>;
  chooseSaveTarget(request: ChooseSaveTargetRequest): Promise<Result<DocumentReference | null>>;
  readDocument(grant: string): Promise<Result<ReadDocumentResponse>>;
  attachDocument(request: AttachDocumentInput): Promise<Result<void>>;
  saveDocument(request: SaveDocumentInput): Promise<Result<SaveDocumentResponse>>;
  sendChanges(request: Omit<ChangeDocumentMessage, "op">): void;
  detachDocument(request: Omit<DetachDocumentMessage, "op">): void;
  releaseDocument(request: ReleaseDocumentRequest): Promise<Result<void>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onOpenRequest(listener: (request: Result<DocumentReference>) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
