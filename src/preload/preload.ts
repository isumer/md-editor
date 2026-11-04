import { contextBridge, ipcRenderer } from "electron";

import type {
  IpcResult,
  MdApi,
  MenuCommand,
  OpenRequestReady,
  OpenedFile,
  SaveFileRequest,
  SavedFile,
} from "../shared/api";

const channels = {
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openExternal: "link:open-external",
  menuCommand: "menu:command",
  openRequest: "file:open-request",
  readyForOpenRequests: "file:open-requests-ready",
} as const;

const mdApi: MdApi = {
  openFile: () =>
    ipcRenderer.invoke(channels.openFile) as Promise<
      IpcResult<OpenedFile | null>
    >,
  saveFile: (request: SaveFileRequest) =>
    ipcRenderer.invoke(channels.saveFile, request) as Promise<
      IpcResult<SavedFile | null>
    >,
  saveFileAs: (request: SaveFileRequest) =>
    ipcRenderer.invoke(channels.saveFileAs, request) as Promise<
      IpcResult<SavedFile | null>
    >,
  openExternal: (url: string) =>
    ipcRenderer.invoke(channels.openExternal, url) as Promise<IpcResult<void>>,
  readyForOpenRequests: () =>
    ipcRenderer.invoke(channels.readyForOpenRequests) as Promise<
      IpcResult<OpenRequestReady>
    >,
  onMenuCommand: (listener: (command: MenuCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => {
      listener(command);
    };
    ipcRenderer.on(channels.menuCommand, handler);
    return () => ipcRenderer.removeListener(channels.menuCommand, handler);
  },
  onOpenRequest: (listener: (request: IpcResult<OpenedFile>) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: IpcResult<OpenedFile>,
    ) => {
      listener(request);
    };
    ipcRenderer.on(channels.openRequest, handler);
    return () => ipcRenderer.removeListener(channels.openRequest, handler);
  },
};

contextBridge.exposeInMainWorld("mdApi", mdApi);
