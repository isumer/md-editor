import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyStagedUpdate,
  launchUpdate,
  resolveUpdateTarget,
  stageUpdate,
} from "../../src/main/update/updateInstall";

const directories: string[] = [];
const release = {
  body: "Safer updates.",
  notes: "Safer updates.",
  url: "https://github.com/isumer/solidmd/releases/tag/v1.2.3",
  version: "v1.2.3",
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "solidmd-update-failure-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) =>
    rm(directory, { force: true, recursive: true })));
});

describe("self-update failure boundaries", () => {
  it("AC-R9-09: maps AppImage architectures and rejects unsupported ones", async () => {
    const directory = await temporaryDirectory();
    const input = {
      appImagePath: path.join(directory, "SolidMD.AppImage"),
      executablePath: path.join(directory, "solidmd"),
      packaged: true,
      platform: "linux" as const,
      version: "1.2.3",
    };

    await expect(resolveUpdateTarget({ ...input, arch: "arm64" }))
      .resolves.toMatchObject({ filename: "SolidMD-1.2.3-arm64.AppImage" });
    await expect(resolveUpdateTarget({ ...input, arch: "ia32" }))
      .resolves.toBeNull();
    await expect(resolveUpdateTarget({
      ...input,
      appImagePath: undefined,
      arch: "ia32",
      platform: "win32",
    })).resolves.toBeNull();
    await expect(resolveUpdateTarget({
      ...input,
      appImagePath: undefined,
      arch: "x64",
      platform: "win32",
    })).resolves.toMatchObject({ stageDirectory: directory });
  });

  it.each([
    ["a failed checksum request", async () => new Response("", { status: 503 })],
    ["an oversized checksum file", async () => new Response("x".repeat(1024 * 1024 + 1))],
    ["a duplicate checksum entry", async () => {
      const digest = "a".repeat(64);
      return new Response(`${digest}  update.exe\n${digest}  update.exe\n`);
    }],
  ])("AC-R9-11: rejects %s", async (_name, fetchUpdate) => {
    const directory = await temporaryDirectory();

    await expect(stageUpdate(release, {
      destination: null,
      filename: "update.exe",
      kind: "installer",
      stageDirectory: directory,
    }, fetchUpdate)).rejects.toThrow("update checksum");
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it("AC-R9-11: rejects a release URL that cannot name trusted assets", async () => {
    const directory = await temporaryDirectory();

    await expect(stageUpdate({ ...release, url: "https://example.test/latest" }, {
      destination: null,
      filename: "update.exe",
      kind: "installer",
      stageDirectory: directory,
    }, vi.fn())).rejects.toThrow("release URL");
  });

  it("AC-R9-11: refuses an AppImage update without its destination", async () => {
    await expect(applyStagedUpdate({
      destination: null,
      filePath: "update.AppImage",
      kind: "appimage",
    }, false, vi.fn())).rejects.toThrow("destination");
  });

  it("AC-R9-09: launches a detached update process", async () => {
    const directory = await temporaryDirectory();
    const marker = path.join(directory, "launched.txt");
    const script = `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "yes")`;

    launchUpdate(process.execPath, ["-e", script]);

    await vi.waitFor(async () => {
      await expect(readFile(marker, "utf8")).resolves.toBe("yes");
    });
  });
});
