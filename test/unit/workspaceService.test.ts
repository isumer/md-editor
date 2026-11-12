import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceService } from "../../src/main/services/workspace";
import type { DocumentGrantService } from "../../src/main/services/documentGrants";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

function serviceFor(
  root: string | null,
  changeSink: ConstructorParameters<typeof WorkspaceService>[2] = () => undefined,
) {
  const documents = {
    openPath: vi.fn(async (_windowId: number, filePath: string) => ({
      canonicalPath: filePath,
      grant: "workspace-grant",
      name: path.basename(filePath),
    })),
  } as unknown as DocumentGrantService;
  const service = new WorkspaceService({
    chooseFolderPath: vi.fn(async () => root),
  }, documents, changeSink);
  return { documents, service };
}

describe("workspace service", () => {
  it("AC-R11-07: creates, renames and deletes a Markdown file inside the root", async () => {
    const root = await temporaryDirectory();
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    await service.createFile(1, "draft.md");
    await expect(fs.readFile(path.join(root, "draft.md"), "utf8")).resolves.toBe("");
    await service.renameFile(1, "draft.md", "notes.md");
    await expect(fs.stat(path.join(root, "draft.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await service.deleteFile(1, "notes.md");
    await expect(fs.stat(path.join(root, "notes.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("AC-R11-07: file actions refuse unsafe paths and escaping symlinks", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await fs.writeFile(path.join(outside, "outside.md"), "outside");
    await fs.symlink(path.join(outside, "outside.md"), path.join(root, "link.md"));
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    for (const unsafe of ["../outside.md", "/tmp/outside.md", "CON.md", "a.md:stream"]) {
      await expect(service.createFile(1, unsafe)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(service.deleteFile(1, "link.md")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(fs.readFile(path.join(outside, "outside.md"), "utf8")).resolves.toBe("outside");
  });

  it("AC-R11-08: a name conflict keeps both files unchanged", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "first.md"), "first");
    await fs.writeFile(path.join(root, "second.md"), "second");
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    await expect(service.renameFile(1, "first.md", "second.md")).rejects.toMatchObject({
      code: "CONFLICT",
      params: { file: "first.md" },
    });
    await expect(fs.readFile(path.join(root, "first.md"), "utf8")).resolves.toBe("first");
    await expect(fs.readFile(path.join(root, "second.md"), "utf8")).resolves.toBe("second");
  });

  it("AC-R11-07: file actions refuse missing roots, non-Markdown names and folders", async () => {
    const root = await temporaryDirectory();
    await fs.mkdir(path.join(root, "folder.md"));
    const { service } = serviceFor(root);

    await expect(service.createFile(1, "new.md")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await service.chooseRoot(1);
    await expect(service.createFile(1, "notes.txt")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(service.deleteFile(1, "folder.md")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("AC-R11-08: creating an existing file reports a conflict and keeps its text", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "existing.md"), "existing");
    const outside = await temporaryDirectory();
    await fs.symlink(outside, path.join(root, "outside"));
    const { service } = serviceFor(root);
    await service.chooseRoot(1);

    await expect(service.createFile(1, "existing.md")).rejects.toMatchObject({
      code: "CONFLICT",
      params: { file: "existing.md" },
    });
    await expect(service.createFile(1, "outside/new.md")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(fs.readFile(path.join(root, "existing.md"), "utf8")).resolves.toBe("existing");
  });

  it("AC-R11-05: classifies watched file, folder, ignored and deleted changes", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "note.md"), "note");
    await fs.writeFile(path.join(root, "data.txt"), "data");
    await fs.mkdir(path.join(root, "folder"));
    const sink = vi.fn();
    const { service } = serviceFor(root, sink);
    await service.chooseRoot(1);
    const inspect = service as unknown as {
      inspectChange(windowId: number, root: string, event: string, file: string): Promise<void>;
    };
    const canonicalRoot = await fs.realpath(root);

    await inspect.inspectChange(1, `${canonicalRoot}-stale`, "rename", "note.md");
    await inspect.inspectChange(1, canonicalRoot, "change", "note.md");
    await inspect.inspectChange(1, canonicalRoot, "rename", "folder");
    await inspect.inspectChange(1, canonicalRoot, "rename", "data.txt");
    await inspect.inspectChange(1, canonicalRoot, "rename", "missing.md");

    expect(sink).toHaveBeenCalledWith(1, {
      canonicalPath: path.join(canonicalRoot, "note.md"),
      kind: "changed",
      path: "note.md",
    });
    expect(sink).toHaveBeenCalledWith(1, {
      canonicalPath: path.join(canonicalRoot, "folder"),
      entryKind: "folder",
      kind: "created",
      path: "folder",
    });
    expect(sink).toHaveBeenCalledWith(1, {
      canonicalPath: path.join(canonicalRoot, "missing.md"),
      kind: "deleted",
      path: "missing.md",
    });
  });

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
