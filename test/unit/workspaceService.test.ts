import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceService } from "../../src/main/services/workspace";
import type { DocumentGrantService } from "../../src/main/services/documentGrants";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-workspace-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

function serviceFor(root: string | null) {
  const documents = {
    openPath: vi.fn(async (_windowId: number, filePath: string) => ({
      canonicalPath: filePath,
      grant: "workspace-grant",
      name: path.basename(filePath),
    })),
  } as unknown as DocumentGrantService;
  const service = new WorkspaceService({
    chooseFolderPath: vi.fn(async () => root),
  }, documents);
  return { documents, service };
}

describe("workspace service", () => {
  it("AC-R11-01: lists visible folders and Markdown files only", async () => {
    const root = await temporaryDirectory();
    await Promise.all([
      fs.mkdir(path.join(root, "notes")),
      fs.mkdir(path.join(root, "node_modules")),
      fs.writeFile(path.join(root, "README.MD"), "# Readme\n"),
      fs.writeFile(path.join(root, "data.json"), "{}\n"),
      fs.writeFile(path.join(root, ".hidden.md"), "# Hidden\n"),
    ]);
    const { service } = serviceFor(root);

    await expect(service.chooseRoot(7)).resolves.toEqual({ name: path.basename(root) });
    await expect(service.listChildren(7, "")).resolves.toEqual([
      { name: "notes", kind: "folder" },
      { name: "README.MD", kind: "file" },
    ]);
  });

  it("AC-R11-04: opens a nested Markdown file through the document grant service", async () => {
    const root = await temporaryDirectory();
    await fs.mkdir(path.join(root, "notes"));
    const filePath = path.join(root, "notes", "daily.md");
    await fs.writeFile(filePath, "# Daily\n");
    const { documents, service } = serviceFor(root);
    await service.chooseRoot(3);

    await expect(service.openFile(3, "notes/daily.md")).resolves.toMatchObject({
      grant: "workspace-grant",
      name: "daily.md",
    });
    expect(documents.openPath).toHaveBeenCalledWith(3, await fs.realpath(filePath));
  });

  it("AC-R11-01: a canceled folder dialog keeps no workspace root", async () => {
    const { service } = serviceFor(null);

    await expect(service.chooseRoot(1)).resolves.toBeNull();
    await expect(service.listChildren(1, "")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("AC-R11-01: listing refuses parent paths and escaping symlinks", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await fs.symlink(outside, path.join(root, "outside"));
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    await expect(service.listChildren(1, "../outside")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(service.listChildren(1, "outside")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
