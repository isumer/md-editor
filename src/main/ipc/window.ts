import { BrowserWindow } from "electron";

import { windowContracts } from "../../shared/ipc/window";
import { handle } from "./handle";

export function registerWindowIpcHandler(): void {
  handle(windowContracts.toggleFullScreen, async (_request, context) => {
    const window = BrowserWindow.fromId(context.windowId);
    if (window === null || window.isDestroyed()) {
      return;
    }
    window.setFullScreen(!window.isFullScreen());
  });
}
