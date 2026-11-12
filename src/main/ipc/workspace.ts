import { workspaceContracts } from "../../shared/ipc/workspace";
import type { WorkspaceService } from "../services/workspace";
import { handle } from "./handle";

export function registerWorkspaceIpcHandlers(service: WorkspaceService): void {
  handle(workspaceContracts.chooseRoot, async (_request, context) =>
    service.chooseRoot(context.windowId));
  handle(workspaceContracts.createFile, async (request, context) =>
    service.createFile(context.windowId, request.path));
  handle(workspaceContracts.deleteFile, async (request, context) =>
    service.deleteFile(context.windowId, request.path));
  handle(workspaceContracts.listChildren, async (request, context) =>
    service.listChildren(context.windowId, request.path));
  handle(workspaceContracts.openFile, async (request, context) =>
    service.openFile(context.windowId, request.path));
  handle(workspaceContracts.renameFile, async (request, context) =>
    service.renameFile(context.windowId, request.path, request.newPath));
}
