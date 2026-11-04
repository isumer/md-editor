import { promises as fs } from "node:fs";

import { BrowserWindow, dialog } from "electron";

function windowFor(windowId: number): BrowserWindow | undefined {
  return BrowserWindow.fromId(windowId) ?? undefined;
}

export async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export class FileDialogs {
  async chooseOpenPath(windowId: number): Promise<string | null> {
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

  async chooseSavePath(
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
}
