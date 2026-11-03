import { promises as fs } from "node:fs";
import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";

import { atomicWrite } from "./atomicWrite";
import {
  IPC_CHANNELS,
  type IpcFailure,
  type IpcResult,
  type MenuCommand,
  type OpenedFile,
  type SaveFileRequest,
  type SavedFile,
} from "../shared/api";

let mainWindow: BrowserWindow | null = null;
let startupFilePath: string | null = null;

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function logProcessEvent(event: string, value: unknown): void {
  console.error(JSON.stringify({ event, message: errorMessage(value) }));
}

process.on("uncaughtException", (error) => {
  logProcessEvent("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logProcessEvent("unhandledRejection", reason);
});

function ipcFailure(error: unknown): IpcFailure {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "UNKNOWN";
  return { ok: false, code, message: errorMessage(error) };
}

function handleIpc<T>(channel: string, action: (...args: unknown[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, value: await action(...args) };
    } catch (error) {
      return ipcFailure(error);
    }
  });
}

async function readDocument(filePath: string): Promise<OpenedFile> {
  return { path: filePath, text: await fs.readFile(filePath, "utf8") };
}

async function showOpenDialog(): Promise<OpenedFile | null> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled || !result.filePaths[0]
    ? null
    : readDocument(result.filePaths[0]);
}

function validSaveRequest(value: unknown): asserts value is SaveFileRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("path" in value) ||
    (value.path !== null && typeof value.path !== "string")
  ) {
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
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? null : (result.filePath ?? null);
}

async function saveDocument(
  rawRequest: unknown,
  forceDialog: boolean,
): Promise<SavedFile | null> {
  validSaveRequest(rawRequest);
  const targetPath =
    !forceDialog && rawRequest.path
      ? rawRequest.path
      : await chooseSavePath(rawRequest.path);
  if (!targetPath) {
    return null;
  }
  await atomicWrite(targetPath, rawRequest.text);
  return { path: targetPath };
}

function registerIpcHandlers(): void {
  handleIpc(IPC_CHANNELS.initialFile, async () =>
    startupFilePath ? readDocument(startupFilePath) : null,
  );
  handleIpc(IPC_CHANNELS.openFile, showOpenDialog);
  handleIpc(IPC_CHANNELS.saveFile, async (request: unknown) =>
    saveDocument(request, false),
  );
  handleIpc(IPC_CHANNELS.saveFileAs, async (request: unknown) =>
    saveDocument(request, true),
  );
  handleIpc(IPC_CHANNELS.openExternal, openExternalUrl);
}

function sendMenuCommand(command: MenuCommand): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.menuCommand, command);
  }
}

function createMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          id: "file-open",
          label: "Open",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand("open"),
        },
        {
          id: "file-save",
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand("save"),
        },
        {
          id: "file-save-as",
          label: "Save As",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuCommand("saveAs"),
        },
        { type: "separator" },
        { role: "quit", label: "Quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openExternalUrl(rawUrl: unknown): Promise<void> {
  if (typeof rawUrl !== "string") {
    throw Object.assign(new Error("Invalid external URL"), { code: "BAD_REQUEST" });
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error("Invalid external URL"), { code: "BAD_REQUEST" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") {
    throw Object.assign(new Error("Unsupported external URL scheme"), {
      code: "BAD_REQUEST",
    });
  }
  await shell.openExternal(rawUrl);
}

function openExternalBackstop(url: string): void {
  void openExternalUrl(url).catch((error) => {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "BAD_REQUEST"
    ) {
      logProcessEvent("open-external", error);
    }
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "MD Editor",
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    logProcessEvent("render-process-gone", details.reason);
  });
  window.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    openExternalBackstop(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalBackstop(url);
    return { action: "deny" };
  });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });
  window.on("unresponsive", () => {
    logProcessEvent("unresponsive", "Renderer window is unresponsive");
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  return window;
}

async function findStartupFile(args: readonly string[]): Promise<string | null> {
  for (const argument of args.slice(1)) {
    if (argument.startsWith("-")) {
      continue;
    }
    const candidate = path.resolve(argument);
    try {
      if ((await fs.stat(candidate)).isFile()) {
        return candidate;
      }
    } catch {
      // Arguments that are not readable files are not open-with targets.
    }
  }
  return null;
}

registerIpcHandlers();

void app.whenReady().then(async () => {
  startupFilePath = await findStartupFile(process.argv);
  createMenu();
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
