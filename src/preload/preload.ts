import { contextBridge, ipcRenderer } from "electron";

import type {
  IpcResult,
  MdApi,
  MenuCommand,
  OpenedFile,
  SaveFileRequest,
  SavedFile,
} from "../shared/api";

const channels = {
  initialFile: "file:initial",
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openExternal: "link:open-external",
  menuCommand: "menu:command",
} as const;

const mdApi: MdApi = {
  getInitialFile: () =>
    ipcRenderer.invoke(channels.initialFile) as Promise<
      IpcResult<OpenedFile | null>
    >,
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
  onMenuCommand: (listener: (command: MenuCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => {
      listener(command);
    };
    ipcRenderer.on(channels.menuCommand, handler);
    return () => ipcRenderer.removeListener(channels.menuCommand, handler);
  },
};

contextBridge.exposeInMainWorld("mdApi", mdApi);
