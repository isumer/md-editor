import { shell } from "electron";

import {
  linkContracts,
  type OpenExternalRequest,
} from "../../shared/ipc/link";
import { serviceError } from "../../shared/ipc/result";
import { handle } from "./handle";

async function openExternalUrl(request: OpenExternalRequest): Promise<void> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw serviceError("BAD_REQUEST", "link.invalid");
  }
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw serviceError("UNSUPPORTED_SCHEME", "link.unsupportedScheme");
  }
  await shell.openExternal(request.url);
}

export function openExternalBackstop(
  url: string,
  logProcessEvent: (event: string, value: unknown) => void,
): void {
  void openExternalUrl({ url }).catch((error) => {
    if (typeof error !== "object" || error === null || !("code" in error) ||
      (error.code !== "BAD_REQUEST" && error.code !== "UNSUPPORTED_SCHEME")) {
      logProcessEvent("open-external", error);
    }
  });
}

export function registerLinkIpcHandler(): void {
  handle(linkContracts.openExternal, async (request) => openExternalUrl(request));
}
