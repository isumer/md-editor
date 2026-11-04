import { IPC_CHANNELS } from "../../shared/api";
import { saveDocument, showOpenDialog } from "../services/file";
import { handleIpc } from "./result";

export function registerFileIpcHandlers(): void {
  handleIpc(IPC_CHANNELS.openFile, showOpenDialog);
  handleIpc(IPC_CHANNELS.saveFile, async (request: unknown) => saveDocument(request, false));
  handleIpc(IPC_CHANNELS.saveFileAs, async (request: unknown) => saveDocument(request, true));
}
