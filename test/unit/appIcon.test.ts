import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");

async function expectFilesEqual(actualPath: string, sourcePath: string): Promise<void> {
  const [actual, source] = await Promise.all([
    fs.readFile(path.join(repositoryRoot, actualPath)),
    fs.readFile(path.join(repositoryRoot, sourcePath)),
  ]);
  expect(actual).toEqual(source);
}

describe("application icons", () => {
  it("builder configuration names each platform icon and both NSIS icons", async () => {
    const configuration = await fs.readFile(
      path.join(repositoryRoot, "electron-builder.yml"),
      "utf8",
    );

    expect(configuration).toContain("icon: build/icon.ico");
    expect(configuration).toContain("icon: build/icon.icns");
    expect(configuration).toContain("icon: build/icon.png");
    expect(configuration).toContain("icon: build/icons");
    expect(configuration).toMatch(/^ {2}installerIcon: build\/icon\.ico$/m);
    expect(configuration).toMatch(/^ {2}uninstallerIcon: build\/icon\.ico$/m);
    expect(configuration).toContain("from: build/icons/512x512.png");
    expect(configuration).toContain("to: window-icon.png");
  });

  it("builder platform icons keep the brand asset bytes", async () => {
    await Promise.all([
      expectFilesEqual("build/icon.ico", "assets/brand/solidmd.ico"),
      expectFilesEqual("build/icon.icns", "assets/brand/solidmd.icns"),
      expectFilesEqual("build/icon.png", "assets/brand/png/solidmd-1024.png"),
    ]);
  });

  it("builder Linux icons keep every supplied brand asset size", async () => {
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

    await Promise.all(sizes.map(async (size) => {
      await expectFilesEqual(
        `build/icons/${size}x${size}.png`,
        `assets/brand/png/solidmd-${size}.png`,
      );
    }));
  });
});
