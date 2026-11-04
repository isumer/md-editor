import { fileContracts } from "../../shared/ipc/file";
import { fileService } from "../services/file";
import { handle } from "./handle";

export function registerFileIpcHandlers(): void {
  handle(fileContracts.openFile, async (_request, context) =>
    fileService.open(context.windowId));
  handle(fileContracts.saveFile, async (request, context) =>
    fileService.save(context.windowId, request));
  handle(fileContracts.saveFileAs, async (request, context) =>
    fileService.saveAs(context.windowId, request));
}
