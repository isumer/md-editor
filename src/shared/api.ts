export const IPC_CHANNELS = {
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openExternal: "link:open-external",
  menuCommand: "menu:command",
  openRequest: "file:open-request",
  readyForOpenRequests: "file:open-requests-ready",
} as const;

export type IpcSuccess<T> = { ok: true; value: T };
export type IpcFailure = { ok: false; code: string; message: string };
export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

export interface OpenedFile {
  path: string;
  text: string;
}

export interface SavedFile {
  path: string;
}

export interface SaveFileRequest {
  path: string | null;
  text: string;
}

export type MenuCommand = "open" | "save" | "saveAs";

export interface OpenRequestReady {
  notice: string | null;
  productName: string;
}

export interface MdApi {
  openFile(): Promise<IpcResult<OpenedFile | null>>;
  saveFile(request: SaveFileRequest): Promise<IpcResult<SavedFile | null>>;
  saveFileAs(request: SaveFileRequest): Promise<IpcResult<SavedFile | null>>;
  openExternal(url: string): Promise<IpcResult<void>>;
  readyForOpenRequests(): Promise<IpcResult<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onOpenRequest(listener: (request: IpcResult<OpenedFile>) => void): () => void;
}
