import path from "node:path";
import { pathToFileURL } from "node:url";

import { net, protocol, type CustomScheme } from "electron";

import {
  MAX_ASSET_RELATIVE_PATH_LENGTH,
  type ResolvedAsset,
} from "../../shared/ipc/ioControl";
import type { Result } from "../../shared/ipc/result";

export const DOC_ASSET_SCHEME = "doc-asset";

const PREFIX = "doc-asset://";
const WINDOW_ID = /^[1-9][0-9]*$/;
const MAX_GRANT_LENGTH = 8 * 1024;
const ENCODED_SEPARATOR = /%(?:2e|2f|5c)/i;

export interface DocAssetRequest {
  windowId: number;
  grant: string;
  relativePath: string;
}

export interface DocAssetResolver {
  resolveAsset(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<Result<ResolvedAsset>>;
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function validRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0 || relativePath.length > MAX_ASSET_RELATIVE_PATH_LENGTH) {
    return false;
  }
  if (relativePath.includes("\0") || relativePath.includes("\\")) {
    return false;
  }
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    return false;
  }
  const segments = relativePath.split("/");
  return !segments.some((segment) => segment === "" || segment === "..");
}

// The URL stays raw until this function sees it: a standard URL parser would normalise
// dot segments away before they can be rejected explicitly.
export function parseDocAssetUrl(requestUrl: string): DocAssetRequest | null {
  if (!requestUrl.startsWith(PREFIX)) {
    return null;
  }
  const afterScheme = requestUrl.slice(PREFIX.length);
  const fragmentIndex = afterScheme.indexOf("#");
  const beforeFragment = fragmentIndex === -1
    ? afterScheme
    : afterScheme.slice(0, fragmentIndex);
  const queryIndex = beforeFragment.indexOf("?");
  const authorityAndPath = queryIndex === -1
    ? beforeFragment
    : beforeFragment.slice(0, queryIndex);
  const slashIndex = authorityAndPath.indexOf("/");
  if (slashIndex === -1) {
    return null;
  }
  const host = authorityAndPath.slice(0, slashIndex);
  const rawPath = authorityAndPath.slice(slashIndex);
  if (!WINDOW_ID.test(host) || !Number.isSafeInteger(Number(host))) {
    return null;
  }
  const grantEnd = rawPath.indexOf("/", 1);
  if (grantEnd === -1) {
    return null;
  }
  const rawGrant = rawPath.slice(1, grantEnd);
  const rawRelativePath = rawPath.slice(grantEnd + 1);
  if (rawGrant.length === 0 || rawGrant.length > MAX_GRANT_LENGTH ||
    !validRelativePath(rawRelativePath) || ENCODED_SEPARATOR.test(rawRelativePath)) {
    return null;
  }
  const grant = decode(rawGrant);
  const relativePath = decode(rawRelativePath);
  if (grant === null || grant.length === 0 || relativePath === null ||
    !validRelativePath(relativePath)) {
    return null;
  }
  return { windowId: Number(host), grant, relativePath };
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function serveDocAssetRequest(
  requestUrl: string,
  resolver: DocAssetResolver,
): Promise<Response> {
  const parsed = parseDocAssetUrl(requestUrl);
  if (!parsed) {
    return notFound();
  }
  try {
    const resolved = await resolver.resolveAsset(
      parsed.windowId,
      parsed.grant,
      parsed.relativePath,
    );
    if (!resolved.ok) {
      return notFound();
    }
    const response = await net.fetch(pathToFileURL(resolved.value.path).href);
    return response.ok ? response : notFound();
  } catch {
    return notFound();
  }
}

export const DOC_ASSET_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: DOC_ASSET_SCHEME,
  privileges: {
    secure: true,
    supportFetchAPI: true,
    allowServiceWorkers: false,
  },
};

export function registerDocAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([DOC_ASSET_SCHEME_PRIVILEGES]);
}

export function registerDocAssetProtocol(resolver: DocAssetResolver): void {
  protocol.handle(DOC_ASSET_SCHEME, (request) =>
    serveDocAssetRequest(request.url, resolver));
}
