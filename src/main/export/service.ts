import { BrowserWindow, dialog } from "electron";

import type { ExportDocumentRequest } from "../../shared/ipc/export";
import type { Result } from "../../shared/ipc/result";
import type { GrantTable } from "../grants/grantTable";
import type { IoWorkerSupervisor } from "../io/ioWorker";
import { createPdfBytes } from "./pdf";

function windowFor(windowId: number): BrowserWindow | undefined {
  return BrowserWindow.fromId(windowId) ?? undefined;
}

export class ExportService {
  constructor(
    private readonly grants: GrantTable,
    private readonly worker: IoWorkerSupervisor,
  ) {}

  async export(windowId: number, request: ExportDocumentRequest): Promise<void> {
    const options: Electron.SaveDialogOptions = {
      defaultPath: request.suggestedName,
      filters: request.format === "html"
        ? [{ name: "HTML", extensions: ["html"] }]
        : [{ name: "PDF", extensions: ["pdf"] }],
    };
    const owner = windowFor(windowId);
    const selected = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);
    if (selected.canceled || !selected.filePath) return;
    const bytes = request.format === "html"
      ? new TextEncoder().encode(request.html)
      : await createPdfBytes({ html: request.html, ...request.options });
    await this.write(windowId, selected.filePath, bytes);
  }

  private async write(windowId: number, filePath: string, bytes: Uint8Array): Promise<void> {
    const grant = this.grants.createHandle(windowId);
    const registered = await this.worker.registerGrant(windowId, grant, filePath, false);
    if (!registered.ok) throw registered.error;
    this.grants.register(windowId, grant, registered.value.canonicalPath, "export");
    try {
      const written: Result<void> = await this.worker.writeExport(windowId, grant, bytes);
      if (!written.ok) throw written.error;
    } finally {
      this.grants.revokeExport(windowId, grant);
      await this.worker.revokeGrant(windowId, grant);
    }
  }
}
