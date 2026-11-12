import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";

import { serviceError, toServiceError } from "../../shared/ipc/result";
import type { WorkspaceChangeMessage, WorkspaceEntry } from "../../shared/ipc/workspace";
import { checkWorkspacePath } from "../../shared/workspace/workspacePath";
import type { IoGrantTable } from "../grants";

type ChangeSink = (windowId: number, change: WorkspaceChangeMessage) => void;
type LinkFile = (source: string, target: string) => Promise<void>;
type UnlinkFile = (filePath: string) => Promise<void>;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function visibleEntry(entry: { isDirectory(): boolean; isFile(): boolean; name: string }): boolean {
  if (entry.name.startsWith(".")) return false;
  if (entry.isDirectory()) return entry.name !== "node_modules";
  return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
}

function compareEntries(left: WorkspaceEntry, right: WorkspaceEntry): number {
  if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase(), "en");
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;
}

export class IoWorkspaceService {
  private readonly watchers = new Map<string, FSWatcher>();
  private changeSink: ChangeSink = () => undefined;

  constructor(
    private readonly grants: IoGrantTable,
    private readonly linkFile: LinkFile = fs.link,
    private readonly unlinkFile: UnlinkFile = fs.unlink,
  ) {}

  setChangeSink(sink: ChangeSink): void {
    this.changeSink = sink;
  }

  watchRoot(windowId: number, grant: string): void {
    const root = this.grants.resolve(windowId, grant, "root");
    this.startWatching(windowId, grant, root);
  }

  async listChildren(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<readonly WorkspaceEntry[]> {
    const root = this.grants.resolve(windowId, grant, "root");
    this.startWatching(windowId, grant, root);
    const directory = await this.resolve(root, relativePath);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter(visibleEntry).map((entry): WorkspaceEntry => ({
      name: entry.name,
      kind: entry.isDirectory() ? "folder" : "file",
    })).sort(compareEntries);
  }

  async resolveFile(windowId: number, grant: string, relativePath: string): Promise<string> {
    const root = this.grants.resolve(windowId, grant, "root");
    return this.resolveMarkdownFile(root, relativePath);
  }

  async createFile(windowId: number, grant: string, relativePath: string): Promise<void> {
    const candidate = await this.newFilePath(windowId, grant, relativePath);
    try {
      const file = await fs.open(candidate, "wx");
      await file.close();
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  async renameFile(
    windowId: number,
    grant: string,
    relativePath: string,
    newPath: string,
  ): Promise<void> {
    const root = this.grants.resolve(windowId, grant, "root");
    const source = await this.resolveMarkdownFile(root, relativePath);
    const target = await this.newFilePath(windowId, grant, newPath);
    try {
      await this.linkFile(source, target);
      await fs.unlink(source);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") await this.rollbackLink(source, target);
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  async deleteFile(windowId: number, grant: string, relativePath: string): Promise<void> {
    const root = this.grants.resolve(windowId, grant, "root");
    const filePath = await this.resolveMarkdownFile(root, relativePath);
    try {
      await this.unlinkFile(filePath);
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  revokeWindow(windowId: number): void {
    for (const [key, watcher] of this.watchers) {
      if (key.startsWith(`${windowId}:`)) {
        watcher.close();
        this.watchers.delete(key);
      }
    }
  }

  private async rollbackLink(source: string, target: string): Promise<void> {
    try {
      await fs.lstat(source);
      await fs.unlink(target);
    } catch {
      // The source was removed, or the target was not created by this operation.
    }
  }

  private async newFilePath(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<string> {
    const checked = checkWorkspacePath(relativePath);
    if (!checked.ok || !relativePath.toLowerCase().endsWith(".md")) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const root = this.grants.resolve(windowId, grant, "root");
    const candidate = path.resolve(root, ...checked.segments);
    const parent = await fs.realpath(path.dirname(candidate));
    if (!isInside(root, parent)) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    return candidate;
  }

  private async resolveMarkdownFile(root: string, relativePath: string): Promise<string> {
    const checked = checkWorkspacePath(relativePath);
    if (!checked.ok || !relativePath.toLowerCase().endsWith(".md")) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    try {
      const filePath = await this.resolve(root, checked.segments.join("/"));
      if (!(await fs.stat(filePath)).isFile()) {
        throw serviceError("NOT_FOUND", "file.notFound", {
          file: path.basename(relativePath),
        });
      }
      return filePath;
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  private async resolve(root: string, relativePath: string): Promise<string> {
    const checked = relativePath === "" ? { ok: true as const, segments: [] } :
      checkWorkspacePath(relativePath);
    if (!checked.ok) throw serviceError("BAD_REQUEST", "request.invalid");
    const candidate = path.resolve(root, ...checked.segments);
    const canonical = await fs.realpath(candidate);
    if (!isInside(root, canonical)) throw serviceError("BAD_REQUEST", "request.invalid");
    return canonical;
  }

  private startWatching(windowId: number, grant: string, root: string): void {
    const key = `${windowId}:${grant}`;
    if (this.watchers.has(key)) return;
    try {
      const watcher = watch(root, { encoding: "utf8", recursive: true }, (event, file) => {
        if (typeof file === "string") void this.inspectChange(windowId, grant, root, event, file);
      });
      watcher.on("error", () => {
        watcher.close();
        this.watchers.delete(key);
      });
      this.watchers.set(key, watcher);
    } catch {
      this.watchers.delete(key);
    }
  }

  private async inspectChange(
    windowId: number,
    grant: string,
    root: string,
    event: string,
    fileName: string,
  ): Promise<void> {
    if (this.grants.resolve(windowId, grant, "root") !== root) return;
    const relative = fileName.split(path.sep).join("/");
    const checked = checkWorkspacePath(relative);
    if (!checked.ok || checked.segments.some((part) =>
      part.startsWith(".") || part === "node_modules")) return;
    const canonicalPath = path.resolve(root, ...checked.segments);
    try {
      const stat = await fs.stat(canonicalPath);
      const entryKind = stat.isDirectory() ? "folder" : "file";
      if (entryKind === "file" && !relative.toLowerCase().endsWith(".md")) return;
      this.changeSink(windowId, event === "change"
        ? { canonicalPath, kind: "changed", path: relative }
        : { canonicalPath, entryKind, kind: "created", path: relative });
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        this.changeSink(windowId, { canonicalPath, kind: "deleted", path: relative });
      }
    }
  }
}
