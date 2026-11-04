import type {
  OpenRequestReady,
  OpenedFile,
  SavedFile,
  SaveFileRequest,
} from "../../shared/ipc/file";
import type { MenuCommand } from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";

interface Api {
  openFile(): Promise<Result<OpenedFile | null>>;
  saveFile(request: SaveFileRequest): Promise<Result<SavedFile | null>>;
  saveFileAs(request: SaveFileRequest): Promise<Result<SavedFile | null>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onOpenRequest(listener: (request: Result<OpenedFile>) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
