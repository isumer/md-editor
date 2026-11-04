import { contextBridge, ipcRenderer } from "electron";

import type {
  FILE_CHANNELS as SharedFileChannels,
  OpenRequestReady,
  OpenedFile,
  SavedFile,
  SaveFileRequest,
} from "../shared/ipc/file";
import type { LINK_CHANNELS as SharedLinkChannels } from "../shared/ipc/link";
import type {
  MENU_CHANNELS as SharedMenuChannels,
  MenuCommand,
} from "../shared/ipc/menu";
import type { Result } from "../shared/ipc/result";

// A sandboxed preload cannot require our modules, so channels are copied; satisfies keeps them in step.
const FILE_CHANNELS = {
  openFile: "file:open",
  saveFile: "file:save",
  saveFileAs: "file:save-as",
  openRequestsReady: "file:open-requests-ready",
  openRequest: "file:open-request",
} as const satisfies typeof SharedFileChannels;
const LINK_CHANNELS = {
  openExternal: "link:open-external",
} as const satisfies typeof SharedLinkChannels;
const MENU_CHANNELS = {
  command: "menu:command",
} as const satisfies typeof SharedMenuChannels;

interface Api {
  openFile(): Promise<Result<OpenedFile | null>>;
  saveFile(request: SaveFileRequest): Promise<Result<SavedFile | null>>;
  saveFileAs(request: SaveFileRequest): Promise<Result<SavedFile | null>>;
  openExternal(url: string): Promise<Result<void>>;
  readyForOpenRequests(): Promise<Result<OpenRequestReady>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  onOpenRequest(listener: (request: Result<OpenedFile>) => void): () => void;
}

const api: Api = {
  openFile: () => ipcRenderer.invoke(FILE_CHANNELS.openFile, {}) as Promise<
    Result<OpenedFile | null>
  >,
  saveFile: (request) => ipcRenderer.invoke(
    FILE_CHANNELS.saveFile,
    request,
  ) as Promise<Result<SavedFile | null>>,
  saveFileAs: (request) => ipcRenderer.invoke(
    FILE_CHANNELS.saveFileAs,
    request,
  ) as Promise<Result<SavedFile | null>>,
  openExternal: (url) => ipcRenderer.invoke(
    LINK_CHANNELS.openExternal,
    { url },
  ) as Promise<Result<void>>,
  readyForOpenRequests: () => ipcRenderer.invoke(
    FILE_CHANNELS.openRequestsReady,
    {},
  ) as Promise<Result<OpenRequestReady>>,
  onMenuCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => {
      listener(command);
    };
    ipcRenderer.on(MENU_CHANNELS.command, handler);
    return () => ipcRenderer.removeListener(MENU_CHANNELS.command, handler);
  },
  onOpenRequest: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: Result<OpenedFile>,
    ) => {
      listener(request);
    };
    ipcRenderer.on(FILE_CHANNELS.openRequest, handler);
    return () => ipcRenderer.removeListener(FILE_CHANNELS.openRequest, handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
