import path from "node:path";

export function resolveWindowIcon(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  appPath: string,
  resourcesPath: string,
): string | undefined {
  if (platform !== "linux" && platform !== "win32") {
    return undefined;
  }
  return isPackaged
    ? path.join(resourcesPath, "window-icon.png")
    : path.join(appPath, "build", "icons", "512x512.png");
}
