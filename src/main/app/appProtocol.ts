import path from "node:path";
import { pathToFileURL } from "node:url";

import { net, protocol, type CustomScheme } from "electron";

export const APP_ENTRY_URL = "app://bundle/index.html";

const APP_SCHEME = "app";
const APP_HOST = "bundle";

function rawPathname(requestUrl: string): string | null {
  const match = /^[^:]+:\/\/[^/?#]*(\/[^?#]*)/.exec(requestUrl);
  return match?.[1] ?? null;
}

function decodedPathname(requestUrl: string): string | null {
  const pathname = rawPathname(requestUrl);
  if (pathname === null) {
    return null;
  }
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isOutside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || relative === ".." ||
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

export function resolveAppRequest(
  requestUrl: string,
  bundleDirectory: string,
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST ||
    url.username !== "" || url.password !== "") {
    return null;
  }
  const pathname = decodedPathname(requestUrl);
  if (pathname === null || !pathname.startsWith("/") || pathname.length === 1 ||
    pathname.endsWith("/") || pathname.includes("\\") || pathname.includes("\0")) {
    return null;
  }
  const relative = pathname.slice(1);
  if (path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    return null;
  }
  const root = path.resolve(bundleDirectory);
  const candidate = path.resolve(root, relative);
  return isOutside(root, candidate) ? null : candidate;
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

async function serveAppRequest(
  requestUrl: string,
  bundleDirectory: string,
): Promise<Response> {
  const filePath = resolveAppRequest(requestUrl, bundleDirectory);
  if (filePath === null) {
    return notFound();
  }
  try {
    const response = await net.fetch(pathToFileURL(filePath).href);
    return response.ok ? response : notFound();
  } catch {
    return notFound();
  }
}

export const APP_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    allowServiceWorkers: false,
  },
};

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([APP_SCHEME_PRIVILEGES]);
}

export function registerAppProtocol(bundleDirectory: string): void {
  protocol.handle(APP_SCHEME, async (request) =>
    serveAppRequest(request.url, bundleDirectory));
}
