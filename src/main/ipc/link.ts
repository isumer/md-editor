import { shell } from "electron";

import { IPC_CHANNELS } from "../../shared/api";
import { handleIpc } from "./result";

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
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw Object.assign(new Error("Unsupported external URL scheme"), {
      code: "BAD_REQUEST",
    });
  }
  await shell.openExternal(rawUrl);
}

export function openExternalBackstop(
  url: string,
  logProcessEvent: (event: string, value: unknown) => void,
): void {
  void openExternalUrl(url).catch((error) => {
    if (typeof error !== "object" || error === null || !("code" in error) ||
      error.code !== "BAD_REQUEST") {
      logProcessEvent("open-external", error);
    }
  });
}

export function registerLinkIpcHandler(): void {
  handleIpc(IPC_CHANNELS.openExternal, openExternalUrl);
}
