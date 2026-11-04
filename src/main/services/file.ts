import { promises as fs } from "node:fs";

import { dialog } from "electron";

import { atomicWrite } from "../../node-shared/atomicWrite";
import type { OpenedFile, SaveFileRequest, SavedFile } from "../../shared/api";
import { getMainWindow } from "../app/window";

export async function readDocument(filePath: string): Promise<OpenedFile> {
  return { path: filePath, text: await fs.readFile(filePath, "utf8") };
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function showOpenDialog(): Promise<OpenedFile | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const mainWindow = getMainWindow();
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || !result.filePaths[0]
    ? null
    : readDocument(result.filePaths[0]);
}

function validSaveRequest(value: unknown): asserts value is SaveFileRequest {
  if (typeof value !== "object" || value === null || !("text" in value) ||
    typeof value.text !== "string" || !("path" in value) ||
    (value.path !== null && typeof value.path !== "string")) {
    throw Object.assign(new Error("Invalid save request"), { code: "BAD_REQUEST" });
  }
}

async function chooseSavePath(currentPath: string | null): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    defaultPath: currentPath ?? "Untitled.md",
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const mainWindow = getMainWindow();
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? null : (result.filePath ?? null);
}

export async function saveDocument(
  rawRequest: unknown,
  forceDialog: boolean,
): Promise<SavedFile | null> {
  validSaveRequest(rawRequest);
  const targetPath = !forceDialog && rawRequest.path
    ? rawRequest.path
    : await chooseSavePath(rawRequest.path);
  if (!targetPath) {
    return null;
  }
  await atomicWrite(targetPath, rawRequest.text);
  return { path: targetPath };
}
