import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

import {
  serviceError,
  toServiceError,
  type Result,
} from "../../shared/ipc/result";

interface Contract<Request> {
  channel: string;
  validate(value: unknown): value is Request;
}

export interface HandlerContext {
  windowId: number;
}

interface TrustedWindow {
  appUrl: string;
  window: BrowserWindow;
}

const trustedWindows = new Map<number, TrustedWindow>();

export function registerTrustedWindow(window: BrowserWindow, appUrl: string): void {
  trustedWindows.set(window.id, { appUrl, window });
}

export function unregisterTrustedWindow(window: BrowserWindow): void {
  trustedWindows.delete(window.id);
}

function senderContext(event: IpcMainInvokeEvent): HandlerContext | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return null;
  }
  const trusted = trustedWindows.get(window.id);
  const topFrame = window.webContents.mainFrame;
  if (!trusted || trusted.window !== window || event.senderFrame !== topFrame ||
    !event.senderFrame.url.startsWith(trusted.appUrl)) {
    return null;
  }
  return { windowId: window.id };
}

function failure<T>(error: unknown): Result<T> {
  return { ok: false, error: toServiceError(error) };
}

export function handle<Request, Response>(
  contract: Contract<Request>,
  action: (request: Request, context: HandlerContext) => Promise<Response>,
): void {
  ipcMain.handle(contract.channel, async (event, ...args): Promise<Result<Response>> => {
    try {
      const context = senderContext(event);
      if (!context) {
        return failure(serviceError("FORBIDDEN_SENDER", "sender.forbidden"));
      }
      const request = args[0];
      if (args.length !== 1 || !contract.validate(request)) {
        return failure(serviceError("BAD_REQUEST", "request.invalid"));
      }
      return { ok: true, value: await action(request, context) };
    } catch (error) {
      return failure(error);
    }
  });
}
