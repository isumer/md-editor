import { describe, expect, it, vi } from "vitest";

import { GrantTable } from "../../src/main/grants/grantTable";
import { WorkspaceService } from "../../src/main/services/workspace";

describe("main workspace grant broker", () => {
  it("AC-R11-01: registers and replaces a window root grant", async () => {
    const grants = new GrantTable();
    const control = {
      registerGrant: vi.fn(async () => ({
        ok: true as const,
        value: { canonicalPath: "/notes", name: "notes" },
      })),
      resolveWorkspaceFile: vi.fn(),
      revokeGrant: vi.fn(async () => undefined),
    };
    const service = new WorkspaceService(
      { chooseFolderPath: vi.fn(async () => "/notes") },
      {} as never,
      grants,
      control,
    );

    const result = await service.chooseRoot(7);

    expect(result).toMatchObject({ name: "notes", grant: expect.any(String) });
    expect(control.registerGrant).toHaveBeenCalledWith(
      7,
      result?.grant,
      "/notes",
      true,
      "root",
    );
    control.registerGrant.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        messageKey: "file.permissionDenied",
        params: { file: "notes" },
        retryable: false,
      },
    } as never);
    await expect(service.chooseRoot(7)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(control.revokeGrant).toHaveBeenCalledWith(7, result?.grant);
  });

  it("AC-R11-04: resolves a worker path before issuing a document grant", async () => {
    const grants = new GrantTable();
    const documents = { openPath: vi.fn(async () => ({ name: "note.md" })) };
    const control = {
      registerGrant: vi.fn(async () => ({
        ok: true as const,
        value: { canonicalPath: "/notes", name: "notes" },
      })),
      resolveWorkspaceFile: vi.fn(async () => ({
        ok: true as const,
        value: { path: "/notes/note.md" },
      })),
      revokeGrant: vi.fn(async () => undefined),
    };
    const service = new WorkspaceService(
      { chooseFolderPath: vi.fn(async () => "/notes") },
      documents as never,
      grants,
      control,
    );
    const chosen = await service.chooseRoot(3);

    await service.openFile(3, "note.md");

    expect(control.resolveWorkspaceFile).toHaveBeenCalledWith(3, chosen?.grant, "note.md");
    expect(documents.openPath).toHaveBeenCalledWith(3, "/notes/note.md");
    control.resolveWorkspaceFile.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "file.notFound",
        params: { file: "missing.md" },
        retryable: false,
      },
    } as never);
    await expect(service.openFile(3, "missing.md")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("AC-R11-01: cancel and open-before-choice leave no root grant", async () => {
    const service = new WorkspaceService(
      { chooseFolderPath: vi.fn(async () => null) },
      {} as never,
      new GrantTable(),
      {} as never,
    );

    await expect(service.chooseRoot(1)).resolves.toBeNull();
    await expect(service.openFile(1, "note.md")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    service.closeWindow(1);
  });
});
