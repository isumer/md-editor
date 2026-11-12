import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  net,
  protocol,
  shell,
  type MessagePortMain,
} from "electron";

import { IO_PORT_CHANNEL, IO_PORT_LOST_CHANNEL } from "../shared/ipc/io";
import { errorMessage } from "../shared/ipc/result";

import {
  APP_ENTRY_URL,
  APP_SCHEME_PRIVILEGES,
  registerAppProtocol,
} from "./app/appProtocol";
import {
  DOC_ASSET_SCHEME_PRIVILEGES,
  registerDocAssetProtocol,
} from "./app/docAssetProtocol";
import {
  createOpenRequests,
  initializeApplication,
  registerApplicationEvents,
  registerOpenRequestIpcHandler,
} from "./app/startup";
import { CloseRequestBroker } from "./app/closeRequests";
import { applyMenuContribution } from "./app/menu";
import { createContributionPump } from "./app/menuContribution";
import { SessionStore, SESSION_VERSION } from "./app/session";
import { SettingsStore } from "./app/settings";
import { createWindow, setMainWindow } from "./app/window";
import { GrantTable } from "./grants/grantTable";
import { createIoWorkerSupervisor } from "./io/ioWorker";
import { registerFileIpcHandlers } from "./ipc/file";
import { openExternalBackstop, registerLinkIpcHandler } from "./ipc/link";
import { registerMenuIpcHandler } from "./ipc/menu";
import { registerSessionIpcHandler } from "./ipc/session";
import { registerSettingsIpcHandler } from "./ipc/settings";
import { registerWorkspaceIpcHandlers } from "./ipc/workspace";
import { DocumentGrantService } from "./services/documentGrants";
import { FileDialogs } from "./services/fileDialogs";
import { WorkspaceService } from "./services/workspace";
import {
  createStartupUpdateCheck,
  createUpdateCheck,
  scheduleStartupUpdateCheck,
} from "./update/updateCheck";
import { SESSION_CHANNELS } from "../shared/ipc/session";
import type { Settings } from "../shared/settings/settings";

performance.mark("main-module-start");

const rendererDirectory = path.join(__dirname, "../renderer");
// Electron accepts this registration only once, so both schemes go in one call.
protocol.registerSchemesAsPrivileged([
  APP_SCHEME_PRIVILEGES,
  DOC_ASSET_SCHEME_PRIVILEGES,
]);

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
const fileDialogs = new FileDialogs();
const fileService = new DocumentGrantService(grants, fileDialogs, ioWorker);
const workspaceService = new WorkspaceService(fileDialogs, fileService);
const openRequests = createOpenRequests(fileService);
const menuContributions = createContributionPump({ apply: applyMenuContribution });
let sessionStore: SessionStore | null = null;
let settingsStore: SettingsStore | null = null;

function readUpdateSettings(): Promise<Settings> {
  return settingsStore === null
    ? Promise.reject(new Error("Settings are not ready."))
    : settingsStore.read();
}

function writeUpdateSettings(settings: Settings): Promise<void> {
  return settingsStore === null
    ? Promise.reject(new Error("Settings are not ready."))
    : settingsStore.write(settings);
}

const checkForUpdates = createUpdateCheck({
  currentVersion: () => app.getVersion(),
  fetchFeed: (url) => net.fetch(url),
  showMessage: (message) => dialog.showMessageBox({
    ...message,
    buttons: [...message.buttons],
    noLink: true,
  }),
  openExternal: (url) => shell.openExternal(url),
  readSettings: readUpdateSettings,
  writeSettings: writeUpdateSettings,
});
const checkForStartupUpdates = createStartupUpdateCheck({
  check: checkForUpdates,
  now: Date.now,
  read: readUpdateSettings,
  write: writeUpdateSettings,
});

const closeRequests = new CloseRequestBroker(
  (windowId, requestId) => {
    const window = requireWindow(windowId);
    window?.webContents.send(SESSION_CHANNELS.requestClose, { id: requestId });
  },
  async (result, windowId) => {
    if (!sessionStore) {
      return;
    }
    const documents = [];
    for (const document of result.documents) {
      const path = document.grant
        ? fileService.resolvePath(windowId, document.grant)
        : null;
      if (path) {
        documents.push({
          name: document.name,
          path,
          savedText: document.savedText,
          text: document.text,
        });
      }
    }
    await sessionStore.write({ documents, version: SESSION_VERSION });
  },
);

function requireWindow(windowId: number): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
    .filter((candidate) => candidate.id === windowId);
  return windows[0] ?? null;
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
    {
      logProcessEvent,
      openExternalBackstop: (url) => openExternalBackstop(url, logProcessEvent),
      attachIoPort,
      closeWindow: async (windowId) => fileService.closeWindow(windowId),
      requestClose: async (window) => {
        if (!openRequests.isRendererReady()) {
          return true;
        }
        const allow = await closeRequests.request(window.id);
        if (!allow) {
          applicationEvents.cancelQuit();
        }
        return allow;
      },
    },
  );
  performance.mark("window-created");
  setMainWindow(window);
}

async function attachIoPort(window: BrowserWindow): Promise<void> {
  await ioWorker.attachWindow(
    window.id,
    (port: MessagePortMain) => {
      if (window.isDestroyed() || window.webContents.mainFrame.url !== APP_ENTRY_URL) {
        port.close();
        return;
      }
      window.webContents.postMessage(IO_PORT_CHANNEL, null, [port]);
    },
    () => {
      if (window.isDestroyed() || window.webContents.mainFrame.url !== APP_ENTRY_URL) {
        return;
      }
      window.webContents.send(IO_PORT_LOST_CHANNEL);
    },
  );
}

registerFileIpcHandlers(fileService);
registerLinkIpcHandler();
registerOpenRequestIpcHandler(openRequests);
registerMenuIpcHandler(menuContributions);
registerWorkspaceIpcHandlers(workspaceService);
const applicationEvents = registerApplicationEvents(
  createApplicationWindow,
  logProcessEvent,
  openRequests,
);
// The io-worker must outlive window close handlers: quitting with dirty tabs
// saves through it before the app exits.
app.on("will-quit", () => ioWorker.stop());
void initializeApplication(
  createApplicationWindow,
  () => ioWorker.start(),
  openRequests,
  () => {
    performance.mark("app-ready");
    sessionStore = new SessionStore(
      path.join(app.getPath("userData"), "session.json"),
      ioWorker,
    );
    settingsStore = createSettingsStore();
    registerSessionIpcHandler(sessionStore, fileService, closeRequests);
    registerSettingsIpcHandler(settingsStore);
    registerAppProtocol(rendererDirectory);
    registerDocAssetProtocol(ioWorker);
  },
  () => {
    void checkForUpdates();
  },
)
  .then(() => scheduleStartupUpdateCheck(checkForStartupUpdates))
  .catch((error: unknown) => {
    logProcessEvent("startup", error);
    app.quit();
  });

function createSettingsStore(): SettingsStore {
  return new SettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
    ioWorker,
  );
}
