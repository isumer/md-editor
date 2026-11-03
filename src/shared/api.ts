export const IPC_CHANNELS = {
  initialFile: "file:initial",
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openExternal: "link:open-external",
  menuCommand: "menu:command",
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

export interface MdApi {
  getInitialFile(): Promise<IpcResult<OpenedFile | null>>;
  openFile(): Promise<IpcResult<OpenedFile | null>>;
  saveFile(request: SaveFileRequest): Promise<IpcResult<SavedFile | null>>;
  saveFileAs(request: SaveFileRequest): Promise<IpcResult<SavedFile | null>>;
  openExternal(url: string): Promise<IpcResult<void>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}
