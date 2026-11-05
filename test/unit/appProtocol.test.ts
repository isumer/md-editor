import path from "node:path";
import { pathToFileURL } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  let handler: ((request: { url: string }) => Promise<Response>) | null = null;
  return {
    fetch: vi.fn(),
    handle: vi.fn((_scheme: string, next: (request: { url: string }) => Promise<Response>) => {
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

import {
  registerAppProtocol,
  registerAppScheme,
  resolveAppRequest,
} from "../../src/main/app/appProtocol";

beforeEach(() => {
  vi.clearAllMocks();
  electron.reset();
});

describe("app protocol path resolution", () => {
  const bundleDirectory = path.resolve("renderer-bundle");

  it.each([
    {
      name: "an inside file",
      url: "app://bundle/index.html",
      expected: path.join(bundleDirectory, "index.html"),
    },
    {
      name: "a nested file",
      url: "app://bundle/assets/main.js",
      expected: path.join(bundleDirectory, "assets", "main.js"),
    },
    {
      name: "a parent segment",
      url: "app://bundle/../package.json",
      expected: null,
    },
    {
      name: "an encoded parent segment",
      url: "app://bundle/%2e%2e/package.json",
      expected: null,
    },
    {
      name: "an encoded absolute parent path",
      url: "app://bundle/%2f../package.json",
      expected: null,
    },
    {
      name: "a backslash",
      url: "app://bundle/assets/%5csecret.txt",
      expected: null,
    },
    {
      name: "a NUL byte",
      url: "app://bundle/assets/%00secret.txt",
      expected: null,
    },
    {
      name: "an absolute path",
      url: "app://bundle//etc/hostname",
      expected: null,
    },
    {
      name: "another host",
      url: "app://other/index.html",
      expected: null,
    },
    {
      name: "a directory",
      url: "app://bundle/assets/",
      expected: null,
    },
    {
      name: "an empty path",
      url: "app://bundle",
      expected: null,
    },
    {
      name: "an empty URL",
      url: "",
      expected: null,
    },
    {
      name: "a malformed escape",
      url: "app://bundle/%not-encoded",
      expected: null,
    },
  ])("AC-SEC-14: resolves $name to the exact allowed outcome", ({ url, expected }) => {
    expect(resolveAppRequest(url, bundleDirectory)).toBe(expected);
  });
});

describe("app protocol registration", () => {
  const bundleDirectory = path.resolve("renderer-bundle");

  it("AC-SEC-14: registers app as a secure standard fetch scheme before ready", () => {
    registerAppScheme();

    expect(electron.registerSchemesAsPrivileged).toHaveBeenCalledWith([{
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        allowServiceWorkers: false,
      },
    }]);
  });

  it("AC-SEC-14: returns an empty 404 without fetching a rejected path", async () => {
    registerAppProtocol(bundleDirectory);

    const response = await electron.getHandler()?.({
      url: "app://other/index.html",
    });

    expect(response?.status).toBe(404);
    await expect(response?.text()).resolves.toBe("");
    expect(electron.fetch).not.toHaveBeenCalled();
  });

  it("AC-SEC-14: serves an allowed bundle file through Electron net fetch", async () => {
    electron.fetch.mockResolvedValueOnce(new Response("asset", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
    registerAppProtocol(bundleDirectory);

    const response = await electron.getHandler()?.({
      url: "app://bundle/assets/main.js",
    });

    expect(electron.fetch).toHaveBeenCalledWith(
      pathToFileURL(path.join(bundleDirectory, "assets", "main.js")).href,
    );
    expect(response?.headers.get("content-type")).toBe("text/plain");
    await expect(response?.text()).resolves.toBe("asset");
  });

  it("AC-SEC-14: returns an empty 404 when bundle file fetching fails", async () => {
    electron.fetch.mockRejectedValueOnce(new Error("missing"));
    registerAppProtocol(bundleDirectory);

    const response = await electron.getHandler()?.({
      url: "app://bundle/missing.js",
    });

    expect(response?.status).toBe(404);
    await expect(response?.text()).resolves.toBe("");
  });
});
