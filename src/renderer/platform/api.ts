import type {
  IpcResult,
  MenuCommand,
  OpenRequestReady,
  OpenedFile,
  SaveFileRequest,
  SavedFile,
} from "../../shared/api";

const api = window.mdApi;

export function openFile(): Promise<IpcResult<OpenedFile | null>> {
  return api.openFile();
}

export function saveFile(
  request: SaveFileRequest,
): Promise<IpcResult<SavedFile | null>> {
  return api.saveFile(request);
}

export function saveFileAs(
  request: SaveFileRequest,
): Promise<IpcResult<SavedFile | null>> {
  return api.saveFileAs(request);
}

export function openExternal(url: string): Promise<IpcResult<void>> {
  return api.openExternal(url);
}

export function readyForOpenRequests(): Promise<IpcResult<OpenRequestReady>> {
  return api.readyForOpenRequests();
}

export function onMenuCommand(
  listener: (command: MenuCommand) => void,
): () => void {
  return api.onMenuCommand(listener);
}

export function onOpenRequest(
  listener: (request: IpcResult<OpenedFile>) => void,
): () => void {
  return api.onOpenRequest(listener);
}
