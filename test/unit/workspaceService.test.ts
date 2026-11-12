import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { IoGrantTable } from "../../src/io-worker/grants";
import { IoPortRegistry, attachIoPort, type IoWorkerPort } from "../../src/io-worker/port";
import { IoFileService } from "../../src/io-worker/services/file";
import { IoWorkspaceService } from "../../src/io-worker/services/workspace";

const temporaryDirectories: string[] = [];

class FakePort implements IoWorkerPort {
  readonly replies: unknown[] = [];
  private listener: ((event: { data: unknown }) => void) | undefined;
  on(_event: "message", listener: (event: { data: unknown }) => void): this {
    this.listener = listener;
    return this;
  }
  postMessage(message: unknown): void {
    this.replies.push(message);
  }
  start(): void {}
  close(): void {}
  send(data: unknown): void {
    this.listener?.({ data });
  }
}

async function temporaryDirectory(): Promise<string> {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-unit-"));
  const directory = await fs.realpath(created);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});
function workerService(
  root: string,
  linkFile?: (source: string, target: string) => Promise<void>,
  unlinkFile?: (filePath: string) => Promise<void>,
) {
  const grants = new IoGrantTable();
  grants.register(1, "root", root, "root");
  grants.register(2, "other-root", root, "root");
  return new IoWorkspaceService(grants, linkFile, unlinkFile);
}

describe("io-worker workspace service", () => {
  it("AC-R11-07: creates, renames and deletes a Markdown file inside the root", async () => {
    const root = await temporaryDirectory();
    const service = workerService(root);

    await service.createFile(1, "root", "draft.md");
    await expect(fs.readFile(path.join(root, "draft.md"), "utf8")).resolves.toBe("");
    await service.renameFile(1, "root", "draft.md", "notes.md");
    await expect(fs.stat(path.join(root, "draft.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await service.deleteFile(1, "root", "notes.md");
    await expect(fs.stat(path.join(root, "notes.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("AC-R11-07: refuses unsafe paths, escaping symlinks and another window grant", async () => {
    const root = await temporaryDirectory();
    const outside = await temporaryDirectory();
    await fs.writeFile(path.join(outside, "outside.md"), "outside");
    await fs.symlink(path.join(outside, "outside.md"), path.join(root, "link.md"));
    await fs.symlink(outside, path.join(root, "outside"));
    await fs.mkdir(path.join(root, "folder.md"));
    const service = workerService(root);

    for (const unsafe of ["../outside.md", "/tmp/outside.md", "CON.md", "a.md:stream"]) {
      await expect(service.createFile(1, "root", unsafe)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await expect(service.deleteFile(1, "root", "link.md")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(service.createFile(1, "root", "outside/new.md"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.createFile(1, "root", "notes.txt"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.deleteFile(1, "root", "notes.txt"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.listChildren(1, "root", "../outside"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.listChildren(1, "other-root", "")).rejects.toMatchObject({
      code: "GRANT_INVALID",
    });
    await expect(service.deleteFile(1, "root", "folder.md"))
      .rejects.toMatchObject({ code: "NOT_FOUND", params: { file: "folder.md" } });
    await expect(fs.readFile(path.join(outside, "outside.md"), "utf8")).resolves.toBe("outside");
  });

  it("AC-R11-08: rename conflict keeps both files unchanged", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "first.md"), "first");
    await fs.writeFile(path.join(root, "second.md"), "second");
    const service = workerService(root);

    await expect(service.renameFile(1, "root", "first.md", "second.md"))
      .rejects.toMatchObject({ code: "CONFLICT", params: { file: "first.md" } });
    await expect(fs.readFile(path.join(root, "first.md"), "utf8")).resolves.toBe("first");
    await expect(fs.readFile(path.join(root, "second.md"), "utf8")).resolves.toBe("second");
  });

  it("AC-R11-08: create conflict keeps the existing file unchanged", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "existing.md"), "existing");
    const service = workerService(root);

    await expect(service.createFile(1, "root", "existing.md"))
      .rejects.toMatchObject({ code: "CONFLICT", params: { file: "existing.md" } });
    await expect(fs.readFile(path.join(root, "existing.md"), "utf8"))
      .resolves.toBe("existing");
  });

  it("AC-R11-08: rename refuses a target created at the atomic operation", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "first.md");
    const target = path.join(root, "second.md");
    await fs.writeFile(source, "source");
    const linkAtRace = async (from: string, to: string): Promise<void> => {
      await fs.writeFile(to, "concurrent");
      await fs.link(from, to);
    };
    const service = workerService(root, linkAtRace);

    await expect(service.renameFile(1, "root", "first.md", "second.md"))
      .rejects.toMatchObject({ code: "CONFLICT", params: { file: "first.md" } });
    await expect(fs.readFile(source, "utf8")).resolves.toBe("source");
    await expect(fs.readFile(target, "utf8")).resolves.toBe("concurrent");
  });

  it("AC-R11-08: missing file names the entry and keeps the tree and disk state", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "kept.md"), "kept");
    const service = workerService(root);
    const before = await service.listChildren(1, "root", "");

    await expect(service.deleteFile(1, "root", "missing.md")).rejects.toMatchObject({
      code: "NOT_FOUND",
      messageKey: "file.notFound",
      params: { file: "missing.md" },
    });
    await expect(service.listChildren(1, "root", "")).resolves.toEqual(before);
    await expect(fs.readFile(path.join(root, "kept.md"), "utf8")).resolves.toBe("kept");
  });

  it("AC-R11-08: permission denial names the entry and keeps both files", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "first.md");
    await fs.writeFile(source, "source");
    const deniedLink = async (): Promise<void> => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    };
    const service = workerService(root, deniedLink);

    await expect(service.renameFile(1, "root", "first.md", "second.md"))
      .rejects.toMatchObject({
        code: "PERMISSION_DENIED",
        messageKey: "file.permissionDenied",
        params: { file: "first.md" },
      });
    await expect(fs.readFile(source, "utf8")).resolves.toBe("source");
    await expect(fs.stat(path.join(root, "second.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("AC-R11-08: delete permission denial keeps the file unchanged", async () => {
    const root = await temporaryDirectory();
    const source = path.join(root, "protected.md");
    await fs.writeFile(source, "protected");
    const denied = async (): Promise<void> => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    };
    const service = workerService(root, undefined, denied);

    await expect(service.deleteFile(1, "root", "protected.md"))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(fs.readFile(source, "utf8")).resolves.toBe("protected");
  });

  it("AC-R11-01: lists folders first and hides unsupported entries", async () => {
    const root = await temporaryDirectory();
    await Promise.all([
      fs.mkdir(path.join(root, "notes")),
      fs.mkdir(path.join(root, "archive")),
      fs.mkdir(path.join(root, "node_modules")),
      fs.writeFile(path.join(root, "README.MD"), "# Readme\n"),
      fs.writeFile(path.join(root, "about.md"), "# About\n"),
      fs.writeFile(path.join(root, "data.json"), "{}\n"),
      fs.writeFile(path.join(root, ".hidden.md"), "# Hidden\n"),
    ]);

    await expect(workerService(root).listChildren(1, "root", "")).resolves.toEqual([
      { name: "archive", kind: "folder" },
      { name: "notes", kind: "folder" },
      { name: "about.md", kind: "file" },
      { name: "README.MD", kind: "file" },
    ]);
  });

  it("AC-R11-05: classifies watcher changes and closes a failed watcher", async () => {
    const root = await temporaryDirectory();
    await fs.writeFile(path.join(root, "note.md"), "note");
    await fs.writeFile(path.join(root, "data.txt"), "data");
    await fs.mkdir(path.join(root, "folder"));
    const service = workerService(root);
    const sink = vi.fn();
    service.setChangeSink(sink);
    await service.listChildren(1, "root", "");
    const internals = service as unknown as {
      inspectChange(
        windowId: number,
        grant: string,
        root: string,
        event: string,
        file: string,
      ): Promise<void>;
      watchers: Map<string, { emit(event: string, ...args: unknown[]): void }>;
    };

    await internals.inspectChange(1, "root", `${root}-stale`, "change", "note.md");
    await internals.inspectChange(1, "root", root, "change", "note.md");
    await internals.inspectChange(1, "root", root, "rename", "folder");
    await internals.inspectChange(1, "root", root, "rename", "data.txt");
    await internals.inspectChange(1, "root", root, "rename", "missing.md");

    expect(sink).toHaveBeenCalledWith(1, expect.objectContaining({
      kind: "changed",
      path: "note.md",
    }));
    expect(sink).toHaveBeenCalledWith(1, expect.objectContaining({
      entryKind: "folder",
      kind: "created",
      path: "folder",
    }));
    expect(sink).toHaveBeenCalledWith(1, expect.objectContaining({
      kind: "deleted",
      path: "missing.md",
    }));
    const watcher = internals.watchers.values().next().value;
    watcher?.emit("change", "rename", Buffer.from("ignored.md"));
    watcher?.emit("error", new Error("watch failed"));
    await service.listChildren(2, "other-root", "");
    service.revokeWindow(1);
    expect(internals.watchers.size).toBe(1);
    service.revokeWindow(2);
    expect(internals.watchers.size).toBe(0);
  });

  it("AC-R11-05: sends created, changed and deleted entries through the worker port", async () => {
    const root = await temporaryDirectory();
    const note = path.join(root, "note.md");
    await fs.writeFile(note, "note");
    const grants = new IoGrantTable();
    grants.register(1, "root", root, "root");
    const workspaces = new IoWorkspaceService(grants);
    const registry = new IoPortRegistry(new IoFileService(grants), workspaces);
    const port = new FakePort();
    registry.attach(1, port);

    port.send({ id: "list", op: "workspaceList", grant: "root", path: "" });
    await expect.poll(() => port.replies.some((reply) =>
      (reply as { id?: string }).id === "list")).toBe(true);
    await fs.writeFile(note, "changed");
    await expect.poll(() => port.replies.some((reply) =>
      (reply as { op?: string }).op === "workspaceChange")).toBe(true);

    port.send({ id: "create", op: "workspaceCreate", grant: "root", path: "draft.md" });
    await expect.poll(() => port.replies.some((reply) =>
      (reply as { id?: string }).id === "create")).toBe(true);
    port.send({
      id: "rename",
      op: "workspaceRename",
      grant: "root",
      path: "draft.md",
      newPath: "done.md",
    });
    await expect.poll(() => port.replies.some((reply) =>
      (reply as { id?: string }).id === "rename")).toBe(true);
    port.send({ id: "delete", op: "workspaceDelete", grant: "root", path: "done.md" });
    await expect.poll(() => port.replies.some((reply) =>
      (reply as { id?: string }).id === "delete")).toBe(true);
    port.send({ id: "missing", op: "workspaceDelete", grant: "root", path: "missing.md" });
    await expect.poll(() => port.replies.find((reply) =>
      (reply as { id?: string }).id === "missing")).toMatchObject({
        result: { ok: false, error: { code: "NOT_FOUND" } },
      });
    workspaces.revokeWindow(1);
    registry.revokeWindow(1);
  });

  it("AC-R11-07: rejects a workspace request when the port has no workspace service", async () => {
    const root = await temporaryDirectory();
    const grants = new IoGrantTable();
    grants.register(1, "root", root, "root");
    const port = new FakePort();
    attachIoPort(port, 1, new IoFileService(grants));

    port.send({ id: "list", op: "workspaceList", grant: "root", path: "" });

    expect(port.replies).toEqual([{
      id: "list",
      result: { ok: false, error: expect.objectContaining({ code: "BAD_REQUEST" }) },
    }]);
  });
});
