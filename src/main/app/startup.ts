import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { app, BrowserWindow } from "electron";

import {
  FILE_CHANNELS,
  fileContracts,
  type DocumentReference,
} from "../../shared/ipc/file";
import { toServiceError, type Result } from "../../shared/ipc/result";
import { handle } from "../ipc/handle";
import type { DocumentGrantService } from "../services/documentGrants";
import { isFile } from "../services/fileDialogs";
import { createMenu } from "./menu";
import { getMainWindow } from "./window";

export interface DataDirectoryInput {
  exeDir: string;
  markerExists: boolean;
  isWritable: boolean;
  defaultUserData: string;
}

export interface DataDirectoryResolution {
  path: string;
  portable: boolean;
  notice?: string;
}

export function resolveDataDirectory(
  input: DataDirectoryInput,
): DataDirectoryResolution {
  if (!input.markerExists) {
    return { path: input.defaultUserData, portable: false };
  }
  if (!input.isWritable) {
    return {
      path: input.defaultUserData,
      portable: false,
      notice: "Portable data is not writable; using the default profile.",
    };
  }
  return { path: path.join(input.exeDir, "data"), portable: true };
}

export function resolveExecutableDirectory(
  executablePath: string,
  appImagePath?: string,
): string {
  return path.dirname(appImagePath ?? executablePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function preparePortableDirectory(directory: string): Promise<boolean> {
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectDataDirectory(input: {
  executablePath: string;
  appImagePath?: string;
  defaultUserData: string;
}): Promise<DataDirectoryResolution> {
  const exeDir = resolveExecutableDirectory(
    input.executablePath,
    input.appImagePath,
  );
  const markerExists = await pathExists(path.join(exeDir, "portable"));
  const isWritable = markerExists
    ? await preparePortableDirectory(path.join(exeDir, "data"))
    : false;
  return resolveDataDirectory({
    exeDir,
    markerExists,
    isWritable,
    defaultUserData: input.defaultUserData,
  });
}

interface OpenRequestDependencies {
  deliver(filePath: string): Promise<void>;
  isFile(filePath: string): Promise<boolean>;
}

export class OpenRequests {
  private readonly pending: string[] = [];
  private operation = Promise.resolve();
  private rendererReady = false;

  constructor(private readonly dependencies: OpenRequestDependencies) {}

  enqueueArguments(arguments_: readonly string[], cwd: string): Promise<void> {
    return this.enqueue(async () => {
      for (const argument of arguments_) {
        if (argument.startsWith("-")) {
          continue;
        }
        const candidate = path.resolve(cwd, argument);
        if (await this.dependencies.isFile(candidate)) {
          this.pending.push(candidate);
        }
      }
      await this.drain();
    });
  }

  enqueueFile(filePath: string): Promise<void> {
    return this.enqueue(async () => {
      const candidate = path.resolve(filePath);
      if (await this.dependencies.isFile(candidate)) {
        this.pending.push(candidate);
      }
      await this.drain();
    });
  }

  setRendererReady(): Promise<void> {
    return this.enqueue(async () => {
      this.rendererReady = true;
      await this.drain();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation, operation);
    this.operation = next.catch(() => undefined);
    return next;
  }

  private async drain(): Promise<void> {
    while (this.rendererReady && this.pending.length > 0) {
      const filePath = this.pending.shift();
      if (filePath) {
        await this.dependencies.deliver(filePath);
      }
    }
  }
}

let startupNotice: string | null = null;

async function deliverOpenRequest(
  fileService: DocumentGrantService,
  filePath: string,
): Promise<void> {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  try {
    const opened = await fileService.openPath(mainWindow.id, filePath);
    mainWindow.webContents.send(FILE_CHANNELS.openRequest, {
      ok: true,
      value: opened,
    } satisfies Result<DocumentReference>);
  } catch (error) {
    mainWindow.webContents.send(
      FILE_CHANNELS.openRequest,
      { ok: false, error: toServiceError(error) } satisfies Result<DocumentReference>,
    );
  }
}

export function createOpenRequests(fileService: DocumentGrantService): OpenRequests {
  return new OpenRequests({
    deliver: async (filePath) => deliverOpenRequest(fileService, filePath),
    isFile,
  });
}

export function registerOpenRequestIpcHandler(openRequests: OpenRequests): void {
  handle(fileContracts.openRequestsReady, async () => {
    await openRequests.setRendererReady();
    return { notice: startupNotice, productName: app.getName() };
  });
}

function reportAsync(
  event: string,
  operation: Promise<void>,
  logProcessEvent: (event: string, value: unknown) => void,
): void {
  void operation.catch((error) => logProcessEvent(event, error));
}

function userFileArguments(argv: readonly string[]): readonly string[] {
  return argv.slice(app.isPackaged ? 1 : 2);
}

function focusMainWindow(): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

export function registerApplicationEvents(
  createApplicationWindow: () => void,
  logProcessEvent: (event: string, value: unknown) => void,
  openRequests: OpenRequests,
): void {
  app.on("second-instance", (_event, argv, cwd) => {
    reportAsync(
      "second-instance",
      openRequests.enqueueArguments(userFileArguments(argv), cwd),
      logProcessEvent,
    );
    focusMainWindow();
  });
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    reportAsync("open-file", openRequests.enqueueFile(filePath), logProcessEvent);
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createApplicationWindow();
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

export async function initializeApplication(
  createApplicationWindow: () => void,
  startIoWorker: () => void,
  openRequests: OpenRequests,
): Promise<void> {
  const dataDirectory = await detectDataDirectory({
    executablePath: process.execPath,
    defaultUserData: app.getPath("userData"),
    ...(process.env.APPIMAGE ? { appImagePath: process.env.APPIMAGE } : {}),
  });
  startupNotice = dataDirectory.notice ?? null;
  app.setPath("userData", dataDirectory.path);
  // Chromium keeps its lock files in userData, so locking first would write to the
  // default profile in portable mode and tie portable and installed copies together.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const startupRequests = openRequests.enqueueArguments(
    userFileArguments(process.argv),
    process.cwd(),
  );
  await app.whenReady();
  await startupRequests;
  createMenu();
  startIoWorker();
  createApplicationWindow();
}
