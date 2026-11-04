import path from "node:path";

import { app } from "electron";

import { errorMessage } from "../shared/ipc/result";

import {
  initializeApplication,
  registerApplicationEvents,
  registerOpenRequestIpcHandler,
} from "./app/startup";
import { createWindow, setMainWindow } from "./app/window";
import { registerFileIpcHandlers } from "./ipc/file";
import { openExternalBackstop, registerLinkIpcHandler } from "./ipc/link";

function logProcessEvent(event: string, value: unknown): void {
  console.error(JSON.stringify({ event, message: errorMessage(value) }));
}

process.on("uncaughtException", (error) => {
  logProcessEvent("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logProcessEvent("unhandledRejection", reason);
});

function createApplicationWindow(): void {
  const window = createWindow(
    path.join(__dirname, "../preload/preload.js"),
    path.join(__dirname, "../renderer/index.html"),
    logProcessEvent,
    (url) => openExternalBackstop(url, logProcessEvent),
  );
  setMainWindow(window);
}

registerFileIpcHandlers();
registerLinkIpcHandler();
registerOpenRequestIpcHandler();
registerApplicationEvents(createApplicationWindow, logProcessEvent);
void initializeApplication(createApplicationWindow).catch((error: unknown) => {
  logProcessEvent("startup", error);
  app.quit();
});
