import path from "node:path";
import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  let handler: ((request: { url: string }) => Promise<Response>) | null = null;
  return {
    fetch: vi.fn(),
    handle: vi.fn((
      _scheme: string,
      next: (request: { url: string }) => Promise<Response>,
    ) => {
      handler = next;
    }),
    registerSchemesAsPrivileged: vi.fn(),
    getHandler: () => handler,
    reset: () => {
      handler = null;
    },
  };
});

vi.mock("electron", () => ({
  net: { fetch: electron.fetch },
  protocol: {
    handle: electron.handle,
    registerSchemesAsPrivileged: electron.registerSchemesAsPrivileged,
  },
}));

import type { Result } from "../../src/shared/ipc/result";
import {
  DOC_ASSET_SCHEME,
  parseDocAssetUrl,
  registerDocAssetProtocol,
  registerDocAssetScheme,
} from "../../src/main/app/docAssetProtocol";

type AssetResult = Result<{ path: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  electron.reset();
});

describe("doc-asset URL parsing", () => {
  it.each([
    {
      name: "a valid request",
      url: "doc-asset://7/grant/images/pic.png",
      expected: { windowId: 7, grant: "grant", relativePath: "images/pic.png" },
    },
    {
      name: "a case-sensitive grant",
      url: "doc-asset://12/AbC_-1/pic.png",
      expected: { windowId: 12, grant: "AbC_-1", relativePath: "pic.png" },
    },
    {
      name: "a nested relative path",
      url: "doc-asset://7/grant/a/b/pic.png",
      expected: { windowId: 7, grant: "grant", relativePath: "a/b/pic.png" },
    },
    {
      name: "a query and fragment",
      url: "doc-asset://7/grant/pic.png?v=1#top",
      expected: { windowId: 7, grant: "grant", relativePath: "pic.png" },
    },
    {
      name: "a query only",
      url: "doc-asset://7/grant/pic.png?v=1",
      expected: { windowId: 7, grant: "grant", relativePath: "pic.png" },
    },
    {
      name: "a fragment only",
      url: "doc-asset://7/grant/pic.png#top",
      expected: { windowId: 7, grant: "grant", relativePath: "pic.png" },
    },
    {
      name: "a query before the path",
      url: "doc-asset://7?x=/grant/pic.png",
      expected: null,
    },
    { name: "a window without a path", url: "doc-asset://7", expected: null },
    {
      name: "a decoded percent escape in the path",
      url: "doc-asset://7/grant/my%20image.png",
      expected: { windowId: 7, grant: "grant", relativePath: "my image.png" },
    },
    { name: "a parent segment", url: "doc-asset://7/grant/../pic.png", expected: null },
    {
      name: "an encoded parent segment",
      url: "doc-asset://7/grant/%2e%2e/pic.png",
      expected: null,
    },
    {
      name: "an encoded separator before a parent",
      url: "doc-asset://7/grant/%2f../pic.png",
      expected: null,
    },
    {
      name: "an encoded backslash",
      url: "doc-asset://7/grant/%5csecret.png",
      expected: null,
    },
    {
      name: "a literal backslash",
      url: "doc-asset://7/grant/a%5Cb.png",
      expected: null,
    },
    {
      name: "an encoded NUL byte",
      url: "doc-asset://7/grant/a%00b.png",
      expected: null,
    },
    {
      name: "an absolute path segment",
      url: "doc-asset://7/grant/%2fetc/passwd",
      expected: null,
    },
    {
      name: "an empty path segment",
      url: "doc-asset://7/grant//pic.png",
      expected: null,
    },
    {
      name: "an empty relative path",
      url: "doc-asset://7/grant",
      expected: null,
    },
    {
      name: "a trailing separator",
      url: "doc-asset://7/grant/",
      expected: null,
    },
    {
      name: "an empty grant",
      url: "doc-asset://7//pic.png",
      expected: null,
    },
    {
      name: "a missing grant",
      url: "doc-asset://7/",
      expected: null,
    },
    { name: "a non-numeric window", url: "doc-asset://abc/grant/pic.png", expected: null },
    { name: "a zero window", url: "doc-asset://0/grant/pic.png", expected: null },
    { name: "a fractional window", url: "doc-asset://1.5/grant/pic.png", expected: null },
    { name: "a negative window", url: "doc-asset://-1/grant/pic.png", expected: null },
    {
      name: "a window with a port",
      url: "doc-asset://7:9/grant/pic.png",
      expected: null,
    },
    {
      name: "an unsafe window integer",
      url: "doc-asset://99999999999999999999/grant/pic.png",
      expected: null,
    },
    {
      name: "a malformed escape",
      url: "doc-asset://7/grant/%not-encoded.png",
      expected: null,
    },
    { name: "another scheme", url: "app://7/grant/pic.png", expected: null },
    { name: "an empty URL", url: "", expected: null },
  ])("AC-SEC-17: parses $name to the exact outcome", ({ url, expected }) => {
    expect(parseDocAssetUrl(url)).toEqual(expected);
  });
});

describe("doc-asset protocol registration", () => {
  it("AC-SEC-17: registers doc-asset as secure and fetchable but not standard", () => {
    registerDocAssetScheme();

    expect(electron.registerSchemesAsPrivileged).toHaveBeenCalledWith([{
      scheme: DOC_ASSET_SCHEME,
      privileges: {
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
      },
    }]);
  });

  it("AC-SEC-17: registers the protocol handler after ready", () => {
    const resolver = { resolveAsset: vi.fn() };
    registerDocAssetProtocol(resolver);

    expect(electron.handle).toHaveBeenCalledWith(DOC_ASSET_SCHEME, expect.any(Function));
  });
});

describe("doc-asset protocol serving", () => {
  function handlerFor(
    resolveAsset: (
      windowId: number,
      grant: string,
      relativePath: string,
    ) => Promise<AssetResult>,
  ) {
    registerDocAssetProtocol({
      resolveAsset: (windowId, grant, relativePath) =>
        resolveAsset(windowId, grant, relativePath),
    });
    return electron.getHandler();
  }

  it("AC-SEC-17: refuses a bad window or grant without fetching a file", async () => {
    const resolveAsset = vi.fn(async (): Promise<AssetResult> => ({
      ok: false,
      error: {
        code: "GRANT_INVALID",
        messageKey: "grant.invalid",
        params: {},
        retryable: false,
      },
    }));
    registerDocAssetProtocol({ resolveAsset });
    const response = await electron.getHandler()?.({
      url: "doc-asset://99/grant/pic.png",
    });

    expect(response?.status).toBe(404);
    await expect(response?.text()).resolves.toBe("");
    expect(resolveAsset).toHaveBeenCalledWith(99, "grant", "pic.png");
    expect(electron.fetch).not.toHaveBeenCalled();
  });

  it("AC-SEC-17: returns an empty 404 for a rejected URL without resolving it", async () => {
    const resolveAsset = vi.fn(async (): Promise<AssetResult> => ({
      ok: true,
      value: { path: "/never" },
    }));
    const handler = handlerFor(resolveAsset);
    const response = await handler?.({
      url: "doc-asset://7/grant/../../outside.png",
    });

    expect(response?.status).toBe(404);
    await expect(response?.text()).resolves.toBe("");
    expect(resolveAsset).not.toHaveBeenCalled();
    expect(electron.fetch).not.toHaveBeenCalled();
  });

  it("AC-SEC-17: streams an allowed file through net fetch", async () => {
    const filePath = path.resolve("documents", "pic.png");
    const streamed = new Response("png", {
      status: 200,
      headers: { "content-type": "image/png" },
    });
    electron.fetch.mockResolvedValueOnce(streamed);
    const handler = handlerFor(async () => ({ ok: true, value: { path: filePath } }));

    const response = await handler?.({ url: "doc-asset://7/grant/pic.png" });

    expect(electron.fetch).toHaveBeenCalledWith(pathToFileURL(filePath).href);
    expect(response).toBe(streamed);
  });

  it("AC-SEC-17: returns an empty 404 when resolution fails or is refused", async () => {
    const failing = handlerFor(async () => {
      throw new Error("worker failed");
    });
    const missing = handlerFor(async () => ({
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "file.notFound",
        params: {},
        retryable: false,
      },
    }));

    const thrown = await failing?.({ url: "doc-asset://7/grant/pic.png" });
    const refused = await missing?.({ url: "doc-asset://7/grant/pic.png" });

    expect(thrown?.status).toBe(404);
    await expect(thrown?.text()).resolves.toBe("");
    expect(refused?.status).toBe(404);
    await expect(refused?.text()).resolves.toBe("");
    expect(electron.fetch).not.toHaveBeenCalled();
  });

  it("AC-SEC-17: returns an empty 404 when the file fetch fails or is not ok", async () => {
    const filePath = path.resolve("documents", "pic.png");
    electron.fetch.mockRejectedValueOnce(new Error("missing"));
    const throwing = handlerFor(async () => ({ ok: true, value: { path: filePath } }));
    electron.fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const refusing = handlerFor(async () => ({ ok: true, value: { path: filePath } }));

    const thrown = await throwing?.({ url: "doc-asset://7/grant/pic.png" });
    const refused = await refusing?.({ url: "doc-asset://7/grant/pic.png" });

    expect(thrown?.status).toBe(404);
    await expect(thrown?.text()).resolves.toBe("");
    expect(refused?.status).toBe(404);
    await expect(refused?.text()).resolves.toBe("");
  });
});
