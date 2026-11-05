import path from "node:path";

import { app, type BrowserWindow, type MessagePortMain } from "electron";

import { IO_PORT_CHANNEL } from "../shared/ipc/io";
import { errorMessage } from "../shared/ipc/result";

import {
  APP_ENTRY_URL,
  registerAppProtocol,
  registerAppScheme,
} from "./app/appProtocol";
import {
  createOpenRequests,
  initializeApplication,
  registerApplicationEvents,
  registerOpenRequestIpcHandler,
} from "./app/startup";
import { createWindow, setMainWindow } from "./app/window";
import { GrantTable } from "./grants/grantTable";
import { createIoWorkerSupervisor } from "./io/ioWorker";
import { registerFileIpcHandlers } from "./ipc/file";
import { openExternalBackstop, registerLinkIpcHandler } from "./ipc/link";
import { DocumentGrantService } from "./services/documentGrants";
import { FileDialogs } from "./services/fileDialogs";

const rendererDirectory = path.join(__dirname, "../renderer");
registerAppScheme();

function logProcessEvent(event: string, value: unknown): void {
  console.error(JSON.stringify({ event, message: errorMessage(value) }));
}

function logIoWorkerExit(code: number, signal: string | null): void {
  console.error(JSON.stringify({ event: "io-worker-exit", code, signal }));
}

const grants = new GrantTable();
const ioWorker = createIoWorkerSupervisor(
  path.join(__dirname, "../io-worker/main.js"),
  grants,
  logIoWorkerExit,
);
const fileService = new DocumentGrantService(grants, new FileDialogs(), ioWorker);
const openRequests = createOpenRequests(fileService);

process.on("uncaughtException", (error) => {
  logProcessEvent("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logProcessEvent("unhandledRejection", reason);
});

function createApplicationWindow(): void {
  const window = createWindow(
    path.join(__dirname, "../preload/preload.js"),
    {
      logProcessEvent,
      openExternalBackstop: (url) => openExternalBackstop(url, logProcessEvent),
      attachIoPort,
      closeWindow: async (windowId) => fileService.closeWindow(windowId),
    },
  );
  setMainWindow(window);
}

async function attachIoPort(window: BrowserWindow): Promise<void> {
  await ioWorker.attachWindow(window.id, (port: MessagePortMain) => {
    if (window.isDestroyed() || window.webContents.mainFrame.url !== APP_ENTRY_URL) {
      port.close();
      return;
    }
    window.webContents.postMessage(IO_PORT_CHANNEL, null, [port]);
  });
}

registerFileIpcHandlers(fileService);
registerLinkIpcHandler();
registerOpenRequestIpcHandler(openRequests);
registerApplicationEvents(createApplicationWindow, logProcessEvent, openRequests);
app.on("before-quit", () => ioWorker.stop());
void initializeApplication(
  createApplicationWindow,
  () => ioWorker.start(),
  openRequests,
  () => registerAppProtocol(rendererDirectory),
).catch((error: unknown) => {
  logProcessEvent("startup", error);
  app.quit();
});
