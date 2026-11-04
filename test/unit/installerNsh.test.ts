import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateInstallerNsh } from "../../scripts/gen-installer-nsh.mjs";

describe("Windows shell installer", () => {
  it("AC-R9-04: generated installer registry operations match the committed golden file", async () => {
    const repositoryRoot = path.resolve(__dirname, "../..");
    const [tableText, packageText, golden] = await Promise.all([
      fs.readFile(path.join(repositoryRoot, "build/shell-integration.json"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      fs.readFile(path.join(repositoryRoot, "build/installer.nsh"), "utf8"),
    ]);

    expect(generateInstallerNsh(JSON.parse(tableText), JSON.parse(packageText))).toBe(golden);
  });
});
