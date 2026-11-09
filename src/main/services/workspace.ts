import { promises as fs } from "node:fs";
import path from "node:path";

import type { DocumentReference } from "../../shared/ipc/file";
import { serviceError } from "../../shared/ipc/result";
import type {
  WorkspaceEntry,
  WorkspaceRoot,
} from "../../shared/ipc/workspace";
import type { DocumentGrantService } from "./documentGrants";

interface WorkspaceDialogs {
  chooseFolderPath(windowId: number): Promise<string | null>;
}

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

  constructor(
    private readonly dialogs: WorkspaceDialogs,
    private readonly documents: DocumentGrantService,
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
    return { name: path.basename(root) || root };
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
