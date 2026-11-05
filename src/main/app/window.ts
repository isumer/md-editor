import { app, BrowserWindow } from "electron";

import {
  registerTrustedWindow,
  unregisterTrustedWindow,
} from "../ipc/handle";
import { APP_ENTRY_URL } from "./appProtocol";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

interface WindowDependencies {
  logProcessEvent(event: string, value: unknown): void;
  openExternalBackstop(url: string): void;
  attachIoPort(window: BrowserWindow): Promise<void>;
  closeWindow(windowId: number): Promise<void>;
}

function wireWindowSecurity(
  window: BrowserWindow,
  logProcessEvent: (event: string, value: unknown) => void,
  openExternalBackstop: (url: string) => void,
): void {
  window.webContents.on("render-process-gone", (_event, details) => {
    logProcessEvent("render-process-gone", details.reason);
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === APP_ENTRY_URL) {
      return;
    }
    event.preventDefault();
    openExternalBackstop(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalBackstop(url);
    return { action: "deny" };
  });
  window.on("unresponsive", () => {
    logProcessEvent("unresponsive", "Renderer window is unresponsive");
  });
}

export function createWindow(
  preloadPath: string,
  dependencies: WindowDependencies,
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: app.getName(),
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  registerTrustedWindow(window, APP_ENTRY_URL);
  wireWindowSecurity(
    window,
    dependencies.logProcessEvent,
    dependencies.openExternalBackstop,
  );
  window.webContents.on("did-finish-load", () => {
    void dependencies.attachIoPort(window).catch((error) => {
      dependencies.logProcessEvent("io-port", error);
    });
  });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });
  window.on("closed", () => {
    unregisterTrustedWindow(window);
    void dependencies.closeWindow(window.id).catch((error) => {
      dependencies.logProcessEvent("close-window", error);
    });
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  void window.loadURL(APP_ENTRY_URL);
  return window;
}
