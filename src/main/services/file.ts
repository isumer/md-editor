import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { BrowserWindow, dialog } from "electron";

import { atomicWrite } from "../../node-shared/atomicWrite";
import type {
  OpenedFile,
  SavedFile,
  SaveFileRequest,
} from "../../shared/ipc/file";
import { toServiceError } from "../../shared/ipc/result";
import { GrantTable } from "../grants/grantTable";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;
}

function fileError(error: unknown, filePath: string): never {
  throw toServiceError(error, { file: path.basename(filePath) || filePath });
}

async function canonicalPath(filePath: string, allowMissing: boolean): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (allowMissing && errorCode(error) === "ENOENT") {
      return absolutePath;
    }
    return fileError(error, filePath);
  }
}

async function readText(filePath: string): Promise<{ canonicalPath: string; text: string }> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return { canonicalPath: await canonicalPath(filePath, false), text };
  } catch (error) {
    return fileError(error, filePath);
  }
}

async function ensureWritable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, constants.W_OK);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      fileError(error, filePath);
    }
  }
}

async function writeText(filePath: string, text: string): Promise<string> {
  try {
    const canonical = await canonicalPath(filePath, true);
    await ensureWritable(canonical);
    await atomicWrite(canonical, text);
    return canonical;
  } catch (error) {
    return fileError(error, filePath);
  }
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function windowFor(windowId: number): BrowserWindow | undefined {
  return BrowserWindow.fromId(windowId) ?? undefined;
}

async function chooseOpenPath(windowId: number): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const window = windowFor(windowId);
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function chooseSavePath(
  windowId: number,
  currentPath: string | null,
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    defaultPath: currentPath ?? "Untitled.md",
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const window = windowFor(windowId);
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? null : (result.filePath ?? null);
}

export class FileService {
  constructor(private readonly grants: GrantTable) {}

  async open(windowId: number): Promise<OpenedFile | null> {
    const filePath = await chooseOpenPath(windowId);
    return filePath ? this.openPath(windowId, filePath) : null;
  }

  async openPath(windowId: number, filePath: string): Promise<OpenedFile> {
    const opened = await readText(filePath);
    const saved = this.adopt(windowId, opened.canonicalPath, path.basename(filePath));
    return { ...saved, text: opened.text };
  }

  async save(windowId: number, request: SaveFileRequest): Promise<SavedFile | null> {
    if (request.grant) {
      const filePath = this.resolve(windowId, request.grant);
      await writeText(filePath, request.text);
      return { grant: request.grant, name: path.basename(filePath) };
    }
    const filePath = await chooseSavePath(windowId, null);
    return filePath ? this.writeAndAdopt(windowId, filePath, request.text) : null;
  }

  async saveAs(windowId: number, request: SaveFileRequest): Promise<SavedFile | null> {
    const currentPath = request.grant ? this.resolve(windowId, request.grant) : null;
    const filePath = await chooseSavePath(windowId, currentPath);
    if (!filePath) {
      return null;
    }
    const saved = await this.writeAndAdopt(windowId, filePath, request.text);
    // The renderer always adopts a Save As result, so the grant it sent is the one it gave up.
    if (request.grant) {
      this.grants.revokeDocument(windowId, request.grant);
    }
    return saved;
  }

  closeWindow(windowId: number): void {
    this.grants.revokeWindow(windowId);
  }

  private async writeAndAdopt(
    windowId: number,
    filePath: string,
    text: string,
  ): Promise<SavedFile> {
    const canonical = await writeText(filePath, text);
    return this.adopt(windowId, canonical, path.basename(filePath));
  }

  private resolve(windowId: number, grant: string): string {
    const result = this.grants.resolve(windowId, grant);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  // Opening does not revoke the current grant: the renderer may still decline to discard it.
  private adopt(windowId: number, canonical: string, name: string): SavedFile {
    return { grant: this.grants.issue(windowId, canonical, "document"), name };
  }
}

export const documentGrants = new GrantTable();
export const fileService = new FileService(documentGrants);
