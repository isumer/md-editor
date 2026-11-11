import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");

function sectionValue(
  config: string,
  section: string,
  key: string,
): string | undefined {
  const lines = config.split(/\r?\n/);
  const start = lines.indexOf(`${section}:`);
  if (start === -1) {
    return undefined;
  }
  for (const line of lines.slice(start + 1)) {
    if (line !== "" && !line.startsWith(" ")) {
      break;
    }
    const match = new RegExp(`^  ${key}: (.+)$`).exec(line);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

const iconFiles = new Map<string, string>([
  ["build/icon.ico", "assets/brand/solidmd.ico"],
  ["build/icon.icns", "assets/brand/solidmd.icns"],
  ["build/icon.png", "assets/brand/png/solidmd-1024.png"],
  ...linuxSizes.map((size): [string, string] => [
    `build/icons/${size}x${size}.png`,
    `assets/brand/png/solidmd-${size}.png`,
  ]),
]);

describe("application icon packaging", () => {
  it("names the platform icon files in electron-builder.yml", async () => {
    const config = await fs.readFile(
      path.join(repositoryRoot, "electron-builder.yml"),
      "utf8",
    );

    expect(sectionValue(config, "win", "icon")).toBe("build/icon.ico");
    expect(sectionValue(config, "mac", "icon")).toBe("build/icon.icns");
    expect(sectionValue(config, "linux", "icon")).toBe("build/icons");
    expect(sectionValue(config, "nsis", "installerIcon")).toBe("build/icon.ico");
    expect(sectionValue(config, "nsis", "uninstallerIcon")).toBe("build/icon.ico");
    expect(config).toContain("from: build/icon.png");
    expect(config).toContain("from: build/icons/512x512.png");
  });

  it("ships icon files byte-identical to the brand sources", async () => {
    for (const [target, source] of iconFiles) {
      const [packaged, brand] = await Promise.all([
        fs.readFile(path.join(repositoryRoot, target)),
        fs.readFile(path.join(repositoryRoot, source)),
      ]);

      expect(packaged.equals(brand), `${target} differs from ${source}`).toBe(true);
    }
  });
});
