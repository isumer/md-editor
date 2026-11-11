import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkRelativePath,
  resolveConfinedPath,
  resolvePathUnderRoot,
} from "../../src/node-shared/pathPolicy";

let temporaryDirectory: string;
let root: string;
let outsidePath: string;

beforeEach(async () => {
  temporaryDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-path-policy-")),
  );
  root = path.join(temporaryDirectory, "documents");
  outsidePath = path.join(temporaryDirectory, "outside.png");
  await fs.mkdir(path.join(root, "nested"), { recursive: true });
  await fs.writeFile(path.join(root, "image.png"), "inside", "utf8");
  await fs.writeFile(path.join(root, "nested", "image.png"), "nested", "utf8");
  await fs.writeFile(outsidePath, "outside", "utf8");
  await fs.writeFile(path.join(root, "CON"), "device", "utf8");
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

describe("path policy rejection table", () => {
  it.each([
    { name: "an inside file", input: "image.png", reason: null },
    { name: "a nested file", input: "nested/image.png", reason: null },
    { name: "a dotted segment", input: "./image.png", reason: null },
    { name: "a name containing two dots", input: "a..b.png", reason: null },
    { name: "a parent segment", input: "../outside.png", reason: "outside" },
    { name: "an encoded parent segment", input: "%2e%2e/outside.png", reason: "encoded" },
    { name: "an encoded separator before a parent", input: "%2f..", reason: "encoded" },
    { name: "an encoded backslash", input: "a%5cb.png", reason: "encoded" },
    { name: "a backslash", input: "a\\b.png", reason: "backslash" },
    { name: "a NUL byte", input: "image\0.png", reason: "nul" },
    { name: "an absolute path", input: "/etc/passwd", reason: "absolute" },
    { name: "a Windows drive path", input: "C:/Windows/system32", reason: "absolute" },
    { name: "a UNC path", input: "//server/share/image.png", reason: "unc" },
    { name: "a backslash UNC path", input: "\\\\server\\share", reason: "unc" },
    { name: "a device name", input: "CON", reason: "device" },
    { name: "a device name with an extension", input: "nul.txt", reason: "device" },
    { name: "a nested device name", input: "nested/LPT9", reason: "device" },
    { name: "an alternate data stream", input: "image.png:stream", reason: "ads" },
    { name: "an empty path", input: "", reason: "empty" },
    { name: "an empty segment", input: "nested//image.png", reason: "empty" },
    { name: "a trailing separator", input: "nested/", reason: "empty" },
  ])("AC-SEC-16: rejects $name with the exact outcome", ({ input, reason }) => {
    expect(checkRelativePath(input)).toBe(reason);
  });
});

describe("confined path resolution", () => {
  it("AC-SEC-16: resolves an inside and a nested file to the canonical path", async () => {
    await expect(resolvePathUnderRoot(root, "image.png")).resolves.toEqual({
      ok: true,
      path: path.join(root, "image.png"),
    });
    await expect(resolveConfinedPath(root, "nested/image.png")).resolves.toEqual({
      ok: true,
      path: path.join(root, "nested", "image.png"),
    });
  });

  it("AC-SEC-16: refuses a path that resolves outside the root", async () => {
    await expect(resolvePathUnderRoot(root, "../outside.png")).resolves.toEqual({
      ok: false,
      reason: "outside",
    });
  });

  if (process.platform !== "win32") {
    it("AC-SEC-16: refuses a symlink that escapes the folder", async () => {
      const link = path.join(root, "link.png");
      await fs.symlink(outsidePath, link);

      await expect(resolvePathUnderRoot(root, "link.png")).resolves.toEqual({
        ok: false,
        reason: "outside",
      });
    });

    it("AC-SEC-16: allows a symlink whose target stays inside the folder", async () => {
      const link = path.join(root, "inside-link.png");
      await fs.symlink(path.join(root, "nested", "image.png"), link);

      await expect(resolvePathUnderRoot(root, "inside-link.png")).resolves.toEqual({
        ok: true,
        path: path.join(root, "nested", "image.png"),
      });
    });
  }

  it("AC-SEC-16: reports an unreadable candidate as an io failure", async () => {
    const result = await resolvePathUnderRoot(root, "missing.png");

    expect(result).toMatchObject({
      ok: false,
      reason: "io",
      error: expect.objectContaining({ code: "ENOENT" }),
    });
  });

  it("AC-SEC-16: reports an unreadable root as an io failure", async () => {
    const result = await resolvePathUnderRoot(
      path.join(temporaryDirectory, "missing"),
      "image.png",
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "io",
      error: expect.objectContaining({ code: "ENOENT" }),
    });
  });

  it("AC-SEC-16: refuses the root itself", async () => {
    await expect(resolvePathUnderRoot(root, ".")).resolves.toEqual({
      ok: false,
      reason: "outside",
    });
  });
});
