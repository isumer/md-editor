import { exportContract } from "../../shared/ipc/export";
import type { ExportService } from "../export/service";
import { handle } from "./handle";

export function registerExportIpcHandler(service: ExportService): void {
  handle(exportContract, async (request, context) => service.export(context.windowId, request));
}
