import { describe, expect, it } from "vitest";

import {
  WORKSPACE_CHANNELS,
  workspaceContracts,
  type WorkspacePathRequest,
} from "../../src/shared/ipc/workspace";
import { isWorkspaceIoRequest } from "../../src/shared/ipc/workspaceIo";

const pathContract = workspaceContracts.listChildren.validate;

function acceptsPath(value: unknown): boolean {
  return pathContract(value);
}

describe("workspace IPC contracts", () => {
  it("AC-R11-01 AC-R11-05 AC-R11-07: names every workspace channel once", () => {
    expect(WORKSPACE_CHANNELS).toEqual({
      change: "workspace:change",
      chooseRoot: "workspace:choose-root",
      createFile: "workspace:create-file",
      deleteFile: "workspace:delete-file",
      listChildren: "workspace:list-children",
      openFile: "workspace:open-file",
      renameFile: "workspace:rename-file",
    });
    expect(workspaceContracts.listChildren.channel).toBe(WORKSPACE_CHANNELS.listChildren);
    expect(workspaceContracts.openFile.channel).toBe(WORKSPACE_CHANNELS.openFile);
    expect(workspaceContracts.renameFile.validate({ path: "a.md", newPath: "b.md" }))
      .toBe(true);
  });

  it("AC-R11-01: accepts only an empty object for choosing a root", () => {
    const validate = workspaceContracts.chooseRoot.validate;

    expect(validate({})).toBe(true);
    for (const value of [null, undefined, 0, "", [], { path: "" }, { extra: true }]) {
      expect(validate(value)).toBe(false);
    }
  });

  it("AC-R11-01: accepts a bounded path without a NUL character", () => {
    const request: WorkspacePathRequest = { path: "notes/daily.md" };

    expect(acceptsPath(request)).toBe(true);
    expect(acceptsPath({ path: "" })).toBe(true);
    expect(acceptsPath({ path: "a".repeat(32 * 1024) })).toBe(true);
    expect(acceptsPath({ path: "a".repeat(32 * 1024 + 1) })).toBe(false);
    expect(acceptsPath({ path: "notes/\u0000daily.md" })).toBe(false);
  });

  it("AC-R11-01: rejects unknown keys and non-string paths", () => {
    for (const value of [
      null,
      undefined,
      "notes",
      [],
      {},
      { path: 1 },
      { path: null },
      { path: "notes", extra: true },
    ]) {
      expect(acceptsPath(value)).toBe(false);
    }
  });

  it("AC-R11-01: refuses own accessors and hostile objects", () => {
    const accessor = Object.defineProperty({}, "path", {
      enumerable: true,
      get: () => "notes",
    });
    const inherited = Object.create({ path: "notes" });
    const hostile = new Proxy({}, {
      ownKeys: () => {
        throw new Error("hostile");
      },
    });

    expect(acceptsPath(accessor)).toBe(false);
    expect(acceptsPath(inherited)).toBe(false);
    expect(acceptsPath(hostile)).toBe(false);
  });

  it("AC-R11-07: accepts only exact worker requests with a root grant", () => {
    expect(isWorkspaceIoRequest({
      id: "list",
      op: "workspaceList",
      grant: "root",
      path: "notes",
    })).toBe(true);
    expect(isWorkspaceIoRequest({
      id: "rename",
      op: "workspaceRename",
      grant: "root",
      path: "a.md",
      newPath: "b.md",
    })).toBe(true);
    expect(isWorkspaceIoRequest({
      id: "extra",
      op: "workspaceDelete",
      grant: "root",
      path: "a.md",
      extra: true,
    })).toBe(false);
    expect(isWorkspaceIoRequest({
      id: "missing-grant",
      op: "workspaceCreate",
      path: "a.md",
    })).toBe(false);
    expect(isWorkspaceIoRequest(null)).toBe(false);
    expect(isWorkspaceIoRequest([])).toBe(false);
    expect(isWorkspaceIoRequest({ path: "a.md" })).toBe(false);
    const accessor = {
      id: "accessor",
      op: "workspaceDelete",
      grant: "root",
    };
    Object.defineProperty(accessor, "path", { get: () => "a.md" });
    expect(isWorkspaceIoRequest(accessor)).toBe(false);
    expect(isWorkspaceIoRequest(new Proxy({}, {
      ownKeys: () => { throw new Error("hostile"); },
    }))).toBe(false);
  });
});
