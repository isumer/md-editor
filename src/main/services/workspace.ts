import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";

import type { DocumentReference } from "../../shared/ipc/file";
import { serviceError, toServiceError } from "../../shared/ipc/result";
import type {
  WorkspaceEntry,
  WorkspaceChangeMessage,
  WorkspaceRoot,
} from "../../shared/ipc/workspace";
import type { DocumentGrantService } from "./documentGrants";
import { checkWorkspacePath } from "../../shared/workspace/workspacePath";

interface WorkspaceDialogs {
  chooseFolderPath(windowId: number): Promise<string | null>;
}

type WorkspaceChangeSink = (windowId: number, change: WorkspaceChangeMessage) => void;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validRelativePath(relativePath: string): boolean {
  return relativePath === "" || (!path.isAbsolute(relativePath) &&
    relativePath.split("/").every((segment) =>
      segment !== "" && segment !== "." && segment !== ".." && !segment.includes("\\")));
}

function visibleEntry(entry: { isDirectory(): boolean; isFile(): boolean; name: string }): boolean {
  if (entry.name.startsWith(".")) {
    return false;
  }
  if (entry.isDirectory()) {
    return entry.name !== "node_modules";
  }
  return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
}

function compareEntries(left: WorkspaceEntry, right: WorkspaceEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase(), "en");
}

export class WorkspaceService {
  private readonly roots = new Map<number, string>();
  private readonly watchers = new Map<number, FSWatcher>();

  constructor(
    private readonly dialogs: WorkspaceDialogs,
    private readonly documents: DocumentGrantService,
    private readonly changeSink: WorkspaceChangeSink,
  ) {}

  async chooseRoot(windowId: number): Promise<WorkspaceRoot | null> {
    const selected = await this.dialogs.chooseFolderPath(windowId);
    if (selected === null) {
      return null;
    }
    const root = await fs.realpath(selected);
    if (!(await fs.stat(root)).isDirectory()) {
      throw serviceError("IS_DIRECTORY", "file.isDirectory", { file: path.basename(root) });
    }
    this.roots.set(windowId, root);
    this.startWatching(windowId, root);
    return { name: path.basename(root) || root };
  }

  closeWindow(windowId: number): void {
    this.watchers.get(windowId)?.close();
    this.watchers.delete(windowId);
    this.roots.delete(windowId);
  }

  async listChildren(windowId: number, relativePath: string): Promise<readonly WorkspaceEntry[]> {
    const directory = await this.resolve(windowId, relativePath);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter(visibleEntry)
      .map((entry): WorkspaceEntry => ({
        name: entry.name,
        kind: entry.isDirectory() ? "folder" : "file",
      }))
      .sort(compareEntries);
  }

  async openFile(windowId: number, relativePath: string): Promise<DocumentReference> {
    const filePath = await this.resolve(windowId, relativePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || !filePath.toLowerCase().endsWith(".md")) {
      throw serviceError("NOT_FOUND", "file.notFound", { file: path.basename(filePath) });
    }
    return this.documents.openPath(windowId, filePath);
  }

  async createFile(windowId: number, relativePath: string): Promise<void> {
    const candidate = await this.newFilePath(windowId, relativePath);
    try {
      const file = await fs.open(candidate, "wx");
      await file.close();
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  async renameFile(windowId: number, relativePath: string, newPath: string): Promise<void> {
    const source = await this.resolveMarkdownFile(windowId, relativePath);
    const target = await this.newFilePath(windowId, newPath);
    let targetExists = true;
    try {
      await fs.lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        targetExists = false;
      } else {
        throw toServiceError(error, { file: path.basename(relativePath) });
      }
    }
    if (targetExists) {
      throw serviceError("CONFLICT", "file.conflict", { file: path.basename(relativePath) });
    }
    try {
      await fs.rename(source, target);
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  async deleteFile(windowId: number, relativePath: string): Promise<void> {
    const filePath = await this.resolveMarkdownFile(windowId, relativePath);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw toServiceError(error, { file: path.basename(relativePath) });
    }
  }

  private rootFor(windowId: number): string {
    const root = this.roots.get(windowId);
    if (root === undefined) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    return root;
  }

  private async newFilePath(windowId: number, relativePath: string): Promise<string> {
    const checked = checkWorkspacePath(relativePath);
    if (!checked.ok || !relativePath.toLowerCase().endsWith(".md")) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const root = this.rootFor(windowId);
    const candidate = path.resolve(root, ...checked.segments);
    const parent = await fs.realpath(path.dirname(candidate));
    if (!isInside(root, parent) || !isInside(root, candidate)) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    return candidate;
  }

  private async resolveMarkdownFile(windowId: number, relativePath: string): Promise<string> {
    const checked = checkWorkspacePath(relativePath);
    if (!checked.ok || !relativePath.toLowerCase().endsWith(".md")) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const filePath = await this.resolve(windowId, checked.segments.join("/"));
    if (!(await fs.stat(filePath)).isFile()) {
      throw serviceError("NOT_FOUND", "file.notFound", { file: path.basename(relativePath) });
    }
    return filePath;
  }

  private startWatching(windowId: number, root: string): void {
    this.watchers.get(windowId)?.close();
    try {
      const watcher = watch(root, { recursive: true }, (event, fileName) => {
        if (typeof fileName === "string") {
          void this.inspectChange(windowId, root, event, fileName);
        }
      });
      watcher.on("error", () => watcher.close());
      this.watchers.set(windowId, watcher);
    } catch {
      this.watchers.delete(windowId);
    }
  }

  private async inspectChange(
    windowId: number,
    root: string,
    event: string,
    fileName: string,
  ): Promise<void> {
    if (this.roots.get(windowId) !== root) return;
    const relative = fileName.split(path.sep).join("/");
    const checked = checkWorkspacePath(relative);
    if (!checked.ok || checked.segments.some((segment) =>
      segment.startsWith(".") || segment === "node_modules")) return;
    const canonicalPath = path.resolve(root, ...checked.segments);
    try {
      const stat = await fs.stat(canonicalPath);
      const entryKind = stat.isDirectory() ? "folder" : "file";
      if (entryKind === "file" && !relative.toLowerCase().endsWith(".md")) return;
      const kind = event === "change" ? "changed" : "created";
      this.changeSink(windowId, kind === "created"
        ? { canonicalPath, entryKind, kind, path: relative }
        : { canonicalPath, kind, path: relative });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.changeSink(windowId, { canonicalPath, kind: "deleted", path: relative });
      }
    }
  }

  private async resolve(windowId: number, relativePath: string): Promise<string> {
    const root = this.roots.get(windowId);
    if (root === undefined || !validRelativePath(relativePath)) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const candidate = path.resolve(root, ...relativePath.split("/").filter(Boolean));
    if (!isInside(root, candidate)) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    const canonical = await fs.realpath(candidate);
    if (!isInside(root, canonical)) {
      throw serviceError("BAD_REQUEST", "request.invalid");
    }
    return canonical;
  }
}
