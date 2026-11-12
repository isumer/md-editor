import { workspaceContracts } from "../../shared/ipc/workspace";
import type { WorkspaceService } from "../services/workspace";
import { handle } from "./handle";

export function registerWorkspaceIpcHandlers(service: WorkspaceService): void {
  handle(workspaceContracts.chooseRoot, async (_request, context) =>
    service.chooseRoot(context.windowId));
  handle(workspaceContracts.openFile, async (request, context) =>
    service.openFile(context.windowId, request.path));
}
