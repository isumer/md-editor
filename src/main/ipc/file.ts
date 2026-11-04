import { fileContracts } from "../../shared/ipc/file";
import type { DocumentGrantService } from "../services/documentGrants";
import { handle } from "./handle";

export function registerFileIpcHandlers(fileService: DocumentGrantService): void {
  handle(fileContracts.openFile, async (_request, context) =>
    fileService.open(context.windowId));
  handle(fileContracts.chooseSaveTarget, async (request, context) =>
    fileService.chooseSaveTarget(context.windowId, request.grant));
  handle(fileContracts.releaseDocument, async (request, context) =>
    fileService.release(context.windowId, request.grant));
}
