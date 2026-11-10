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
      fs.writeFile(path.join(root, "alpha.md"), "# Alpha\n"),
      fs.writeFile(path.join(root, "README.MD"), "# Readme\n"),
      fs.writeFile(path.join(root, "zeta.md"), "# Zeta\n"),
      fs.writeFile(path.join(root, "data.json"), "{}\n"),
      fs.writeFile(path.join(root, ".hidden.md"), "# Hidden\n"),
    ]);
    const { service } = serviceFor(root);

    await expect(service.chooseRoot(7)).resolves.toEqual({ name: path.basename(root) });
    await expect(service.listChildren(7, "")).resolves.toEqual([
      { name: "notes", kind: "folder" },
      { name: "alpha.md", kind: "file" },
      { name: "README.MD", kind: "file" },
      { name: "zeta.md", kind: "file" },
    ]);
  });

  it("AC-R11-01: names a filesystem root without an empty label", async () => {
    const { service } = serviceFor(path.parse(process.cwd()).root);

    await expect(service.chooseRoot(7)).resolves.toEqual({
      name: path.parse(process.cwd()).root,
    });
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

  it("AC-R11-01: refuses malformed relative paths before touching the disk", async () => {
    const root = await temporaryDirectory();
    await fs.mkdir(path.join(root, "notes"));
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    const refused = [
      "/etc/passwd",
      ".",
      "..",
      "notes/../notes",
      "notes//daily.md",
      "notes\\daily.md",
    ];
    for (const relativePath of refused) {
      await expect(service.listChildren(1, relativePath)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("AC-R11-01: a chosen path that is a file is refused", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "notes.md");
    await fs.writeFile(filePath, "# Notes\n");
    const { service } = serviceFor(filePath);

    await expect(service.chooseRoot(1)).rejects.toMatchObject({
      code: "IS_DIRECTORY",
      messageKey: "file.isDirectory",
      params: { file: "notes.md" },
    });
  });

  it("AC-R11-04: opening a folder or a non-Markdown file is refused", async () => {
    const root = await temporaryDirectory();
    await fs.mkdir(path.join(root, "notes"));
    await fs.writeFile(path.join(root, "data.json"), "{}\n");
    const { documents, service } = serviceFor(root);
    await service.chooseRoot(1);

    await expect(service.openFile(1, "notes")).rejects.toMatchObject({
      code: "NOT_FOUND",
      params: { file: "notes" },
    });
    await expect(service.openFile(1, "data.json")).rejects.toMatchObject({
      code: "NOT_FOUND",
      params: { file: "data.json" },
    });
    expect(documents.openPath).not.toHaveBeenCalled();
  });

  it("AC-R11-04: opening before a root is chosen is refused", async () => {
    const { documents, service } = serviceFor(null);

    await expect(service.openFile(1, "notes.md")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(documents.openPath).not.toHaveBeenCalled();
  });
});
