import { describe, expect, it, vi } from "vitest";

import { GrantTable } from "../../src/main/grants/grantTable";
import { WorkspaceService } from "../../src/main/services/workspace";

describe("main workspace grant broker", () => {
  it("AC-R11-01: a failed replacement keeps the current root grant", async () => {
    const grants = new GrantTable();
    const control = {
      registerGrant: vi.fn(async () => ({
        ok: true as const,
        value: { canonicalPath: "/notes", name: "notes" },
      })),
      resolveWorkspaceFile: vi.fn(async () => ({
        ok: true as const,
        value: { path: "/notes/kept.md" },
      })),
      revokeGrant: vi.fn(async () => undefined),
    };
    const service = new WorkspaceService(
      { chooseFolderPath: vi.fn(async () => "/notes") },
      { openPath: vi.fn(async () => ({
        canonicalPath: "/notes/kept.md", grant: "document", name: "kept.md",
      })) } as never,
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
    expect(control.revokeGrant).not.toHaveBeenCalledWith(7, result?.grant);
    await expect(service.openFile(7, "kept.md")).resolves.toBeDefined();
    expect(control.resolveWorkspaceFile).not.toHaveBeenCalled();
  });

  it("AC-R11-01: canceling a replacement keeps the current root grant", async () => {
    const choices = vi.fn()
      .mockResolvedValueOnce("/notes")
      .mockResolvedValueOnce(null);
    const grants = new GrantTable();
    const control = {
      registerGrant: vi.fn(async () => ({
        ok: true as const,
        value: { canonicalPath: "/notes", name: "notes" },
      })),
      resolveWorkspaceFile: vi.fn(async () => ({
        ok: true as const,
        value: { path: "/notes/kept.md" },
      })),
      revokeGrant: vi.fn(async () => undefined),
    };
    const documents = { openPath: vi.fn(async () => ({
      canonicalPath: "/notes/kept.md", grant: "document", name: "kept.md",
    })) };
    const service = new WorkspaceService(
      { chooseFolderPath: choices }, documents as never, grants, control,
    );
    const current = await service.chooseRoot(7);

    await expect(service.chooseRoot(7)).resolves.toBeNull();
    await expect(service.openFile(7, "kept.md")).resolves.toBeDefined();

    expect(current?.grant).toBeDefined();
    expect(control.resolveWorkspaceFile).not.toHaveBeenCalled();
    expect(control.revokeGrant).not.toHaveBeenCalled();
  });

  it("AC-R11-01: a successful replacement revokes the previous root grant", async () => {
    const choices = vi.fn()
      .mockResolvedValueOnce("/first")
      .mockResolvedValueOnce("/second");
    const grants = new GrantTable();
    const control = {
      registerGrant: vi.fn(async (
        _windowId: number,
        _handle: string,
        selected: string,
      ) => ({
        ok: true as const,
        value: { canonicalPath: selected, name: selected.slice(1) },
      })),
      resolveWorkspaceFile: vi.fn(),
      revokeGrant: vi.fn(async () => undefined),
    };
    const service = new WorkspaceService(
      { chooseFolderPath: choices }, {} as never, grants, control,
    );
    const first = await service.chooseRoot(4);

    const second = await service.chooseRoot(4);

    expect(second?.name).toBe("second");
    expect(control.revokeGrant).toHaveBeenCalledWith(4, first?.grant);
  });

  it("AC-R11-04: issues one canonical document grant for a workspace file", async () => {
    const grants = new GrantTable();
    const documents = { openPath: vi.fn(async () => ({
      canonicalPath: "/notes/note.md", grant: "document", name: "note.md",
    })) };
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

    expect(documents.openPath).toHaveBeenCalledWith(3, "/notes/note.md");
    expect(control.resolveWorkspaceFile).not.toHaveBeenCalled();
    expect(chosen?.grant).toBeDefined();
  });

  it("AC-R11-07: rejects unsafe and escaping workspace open paths", async () => {
    const grants = new GrantTable();
    const documents = {
      openPath: vi.fn(async () => ({
        canonicalPath: "/outside/note.md", grant: "document", name: "note.md",
      })),
      release: vi.fn(async () => undefined),
    };
    const control = {
      registerGrant: vi.fn(async () => ({
        ok: true as const,
        value: { canonicalPath: "/notes", name: "notes" },
      })),
      revokeGrant: vi.fn(async () => undefined),
    };
    const service = new WorkspaceService(
      { chooseFolderPath: vi.fn(async () => "/notes") },
      documents as never,
      grants,
      control,
    );
    await service.chooseRoot(3);

    await expect(service.openFile(3, "../outside.md"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.openFile(3, "note.txt"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.openFile(3, "note.md"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(documents.openPath).toHaveBeenCalledOnce();
    expect(documents.release).toHaveBeenCalledWith(3, "document");
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
