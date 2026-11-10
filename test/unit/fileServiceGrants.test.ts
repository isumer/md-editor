import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  fromId: vi.fn(() => null),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromId: electron.fromId },
  dialog: {
    showOpenDialog: electron.showOpenDialog,
    showSaveDialog: electron.showSaveDialog,
  },
}));

import { GrantTable } from "../../src/main/grants/grantTable";
import type { GrantControl } from "../../src/main/services/documentGrants";
import { DocumentGrantService } from "../../src/main/services/documentGrants";
import { FileDialogs } from "../../src/main/services/fileDialogs";

function createControl() {
  const revoked = new Set<string>();
  return {
    revoked,
    registerGrant: vi.fn<GrantControl["registerGrant"]>(async (
      _windowId: number,
      _handle: string,
      filePath: string,
      _mustExist: boolean,
    ) => ({
      ok: true as const,
      value: { canonicalPath: path.resolve(filePath), name: path.basename(filePath) },
    })),
    revokeGrant: vi.fn<GrantControl["revokeGrant"]>(async (
      _windowId: number,
      handle: string,
    ) => {
      revoked.add(handle);
    }),
    revokeWindow: vi.fn<GrantControl["revokeWindow"]>(async () => undefined),
  } satisfies GrantControl & { revoked: Set<string> };
}

beforeEach(() => {
  vi.clearAllMocks();
  electron.fromId.mockReturnValue(null);
});

describe("file service grants", () => {
  it("AC-R5-12: handles canceled dialogs without an owning window", async () => {
    const service = new DocumentGrantService(
      new GrantTable(),
      new FileDialogs(),
      createControl(),
    );
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    electron.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    await expect(service.open(1)).resolves.toBeNull();
    await expect(service.chooseSaveTarget(1, null)).resolves.toBeNull();
  });

  it("AC-R5-10: registers dialog paths before exposing their grants", async () => {
    const control = createControl();
    const grants = new GrantTable();
    const service = new DocumentGrantService(grants, new FileDialogs(), control);
    electron.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/documents/opened.md"],
    });
    electron.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/documents/saved.md",
    });

    const opened = await service.open(1);
    const saved = await service.chooseSaveTarget(1, opened?.grant ?? null);

    expect(control.registerGrant.mock.calls.map((call) => [call[2], call[3]]))
      .toEqual([
        ["/documents/opened.md", true],
        ["/documents/saved.md", false],
      ]);
    expect(opened).toMatchObject({ name: "opened.md", grant: expect.any(String) });
    expect(saved).toMatchObject({ name: "saved.md", grant: expect.any(String) });
  });

  it("AC-SEC-07: returns registration failures without issuing a grant", async () => {
    const grants = new GrantTable();
    const control = createControl();
    control.registerGrant.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "file.notFound",
        params: { file: "missing.md" },
        retryable: false,
      },
    });
    const service = new DocumentGrantService(grants, new FileDialogs(), control);

    await expect(service.openPath(1, "/documents/missing.md"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(grants.entries(1)).toEqual([]);
  });

  it("AC-R4-08: resolves an owned grant path and refuses an unknown or foreign grant", async () => {
    const service = new DocumentGrantService(
      new GrantTable(),
      new FileDialogs(),
      createControl(),
    );
    const opened = await service.openPath(1, "/documents/note.md");
    if (!opened) {
      throw new Error("the open did not return a grant");
    }

    expect(service.resolvePath(1, opened.grant))
      .toBe(path.resolve("/documents/note.md"));
    expect(service.resolvePath(1, "unknown")).toBeNull();
    expect(service.resolvePath(2, opened.grant)).toBeNull();
  });

  it("AC-R5-09: choosing another path keeps the current grant live", async () => {
    const grants = new GrantTable();
    const control = createControl();
    const service = new DocumentGrantService(grants, new FileDialogs(), control);
    const current = await service.openPath(1, "/documents/current.md");
    electron.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: "/documents/other.md",
    });

    await service.chooseSaveTarget(1, current.grant);

    expect(grants.resolve(1, current.grant)).toEqual({
      ok: true,
      value: path.resolve("/documents/current.md"),
    });
    expect(control.revokeGrant).not.toHaveBeenCalled();
  });

  it("AC-SEC-09: release revokes a document in main and the io-worker", async () => {
    const grants = new GrantTable();
    const control = createControl();
    const service = new DocumentGrantService(grants, new FileDialogs(), control);
    const opened = await service.openPath(1, "/documents/current.md");

    await service.release(1, opened.grant);

    expect(grants.resolve(1, opened.grant).ok).toBe(false);
    expect(control.revoked).toContain(opened.grant);
  });

  it("AC-SEC-09: closing a window revokes all grants in both tables", async () => {
    const grants = new GrantTable();
    const control = createControl();
    const service = new DocumentGrantService(grants, new FileDialogs(), control);
    await service.openPath(1, "/documents/current.md");

    await service.closeWindow(1);

    expect(grants.entries(1)).toEqual([]);
    expect(control.revokeWindow).toHaveBeenCalledWith(1);
  });

  it("AC-SEC-09: Save As from another window's grant is refused before any dialog", async () => {
    const control = createControl();
    const service = new DocumentGrantService(new GrantTable(), new FileDialogs(), control);
    const opened = await service.openPath(1, "/documents/current.md");

    await expect(service.chooseSaveTarget(2, opened.grant)).rejects.toMatchObject({
      code: "GRANT_INVALID",
    });
    expect(electron.showSaveDialog).not.toHaveBeenCalled();
    expect(control.registerGrant).toHaveBeenCalledOnce();
  });
});
