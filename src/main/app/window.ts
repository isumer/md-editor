import { app, BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
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
  rendererPath: string,
  logProcessEvent: (event: string, value: unknown) => void,
  openExternalBackstop: (url: string) => void,
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
    },
  });
  wireWindowSecurity(window, logProcessEvent, openExternalBackstop);
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  void window.loadFile(rendererPath);
  return window;
}
