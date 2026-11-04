import { ipcMain } from "electron";

import type { IpcFailure, IpcResult } from "../../shared/api";

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function ipcFailure(error: unknown): IpcFailure {
  const code = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : "UNKNOWN";
  return { ok: false, code, message: errorMessage(error) };
}

export function handleIpc<T>(
  channel: string,
  action: (...args: unknown[]) => Promise<T>,
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, value: await action(...args) };
    } catch (error) {
      return ipcFailure(error);
    }
  });
}
