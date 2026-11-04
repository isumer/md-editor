import type {
  OpenRequestReady,
  OpenedFile,
  SavedFile,
  SaveFileRequest,
} from "../../shared/ipc/file";
import type { MenuCommand } from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";

const api = window.api;

export function openFile(): Promise<Result<OpenedFile | null>> {
  return api.openFile();
}

export function saveFile(
  request: SaveFileRequest,
): Promise<Result<SavedFile | null>> {
  return api.saveFile(request);
}

export function saveFileAs(
  request: SaveFileRequest,
): Promise<Result<SavedFile | null>> {
  return api.saveFileAs(request);
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
  listener: (request: Result<OpenedFile>) => void,
): () => void {
  return api.onOpenRequest(listener);
}
