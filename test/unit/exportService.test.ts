import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  fromId: vi.fn(() => null),
  showSaveDialog: vi.fn(),
  // Stubs so src/main/export/pdf (imported by the service module) evaluates
  // without a real Electron; its functions are never called here.
  app: { once: vi.fn(), removeListener: vi.fn() },
  protocol: { isProtocolHandled: vi.fn(() => false), handle: vi.fn() },
}));

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: { fromId: electron.fromId },
  dialog: { showSaveDialog: electron.showSaveDialog },
  protocol: electron.protocol,
}));

import { ExportService } from "../../src/main/export/service";
import { GrantTable } from "../../src/main/grants/grantTable";
import type { IoWorkerSupervisor } from "../../src/main/io/ioWorker";

function worker() {
  return {
    registerGrant: vi.fn(async (_windowId, _grant, filePath: string) => ({
      ok: true as const,
      value: { canonicalPath: filePath, name: "export" },
    })),
    writeExport: vi.fn(async (
      _windowId: number,
      _grant: string,
      _bytes: Uint8Array,
    ) => ({ ok: true as const, value: undefined })),
    revokeGrant: vi.fn(async (_windowId: number, _grant: string) => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  electron.fromId.mockReturnValue(null);
});

describe("export service", () => {
  it("AC-R6-01: writes the chosen HTML file through a temporary grant", async () => {
    const io = worker();
    const service = new ExportService(new GrantTable(), io as unknown as IoWorkerSupervisor);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "/tmp/note.html" });

    await service.export(4, {
      format: "html", html: "<!doctype html><h1>Note</h1>", suggestedName: "note.html",
    });

    expect(io.registerGrant).toHaveBeenCalledWith(4, expect.any(String), "/tmp/note.html", false);
    const bytes = io.writeExport.mock.calls[0]?.[2] as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toContain("<h1>Note</h1>");
    expect(io.revokeGrant).toHaveBeenCalledWith(4, expect.any(String));
  });

  it("AC-R6-03 AC-R6-04: prints PDF options and writes the returned bytes", async () => {
    const io = worker();
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const buildPdf = vi.fn(async (_value: unknown) => bytes);
    const service = new ExportService(
      new GrantTable(),
      io as unknown as IoWorkerSupervisor,
      buildPdf,
    );
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "/tmp/note.pdf" });
    const options = {
      pageSize: "Letter" as const,
      margins: { top: 1, bottom: 1, left: 0.5, right: 0.5 },
      printBackground: false,
    };

    await service.export(4, {
      format: "pdf", html: "<p>PDF</p>", suggestedName: "note.pdf", options,
    });

    expect(buildPdf).toHaveBeenCalledWith({ html: "<p>PDF</p>", ...options });
    expect(io.writeExport).toHaveBeenCalledWith(4, expect.any(String), bytes);
  });

  it("AC-R6-01: cancellation does not register or write a file", async () => {
    const io = worker();
    const service = new ExportService(new GrantTable(), io as unknown as IoWorkerSupervisor);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    await service.export(4, { format: "html", html: "", suggestedName: "note.html" });

    expect(io.registerGrant).not.toHaveBeenCalled();
    expect(io.writeExport).not.toHaveBeenCalled();
  });

  it("AC-R6-01: a canceled dialog with no path does not write", async () => {
    const io = worker();
    const service = new ExportService(new GrantTable(), io as unknown as IoWorkerSupervisor);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "" });

    await service.export(4, { format: "html", html: "", suggestedName: "note.html" });

    expect(io.registerGrant).not.toHaveBeenCalled();
  });

  it("AC-R6-01: a rejected export path does not write bytes", async () => {
    const io = worker();
    io.registerGrant.mockResolvedValueOnce({
      ok: false,
      error: { code: "DENIED", messageKey: "file.permissionDenied", params: {}, retryable: false },
    } as never);
    const service = new ExportService(new GrantTable(), io as unknown as IoWorkerSupervisor);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "/tmp/note.html" });

    await expect(service.export(4, {
      format: "html", html: "", suggestedName: "note.html",
    })).rejects.toMatchObject({ code: "DENIED" });
    expect(io.writeExport).not.toHaveBeenCalled();
  });

  it("AC-R6-01: a failed atomic write still revokes the export grant", async () => {
    const io = worker();
    io.writeExport.mockResolvedValueOnce({
      ok: false,
      error: { code: "DISK_FULL", messageKey: "file.diskFull", params: {}, retryable: false },
    } as never);
    const service = new ExportService(new GrantTable(), io as unknown as IoWorkerSupervisor);
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "/tmp/note.html" });

    await expect(service.export(4, {
      format: "html", html: "", suggestedName: "note.html",
    })).rejects.toMatchObject({ code: "DISK_FULL" });
    expect(io.revokeGrant).toHaveBeenCalledOnce();
  });
});
