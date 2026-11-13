import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("release workflow", () => {
  it("tests the portable build with an isolated default profile", async () => {
    const workflowUrl = new URL(
      "../../.github/workflows/release.yml",
      import.meta.url,
    );

    const workflow = await readFile(workflowUrl, "utf8");
    const portableStart = workflow.indexOf(
      "$portable = Start-Process $portableExe.FullName",
    );
    const profileSetup = workflow.indexOf(
      "$portableAppData = Join-Path $env:RUNNER_TEMP \"solidmd-portable-appdata\"",
    );

    expect(profileSetup).toBeGreaterThan(-1);
    expect(profileSetup).toBeLessThan(portableStart);
    expect(workflow.slice(profileSetup, portableStart)).toContain(
      "$env:APPDATA = $portableAppData",
    );
    expect(workflow.slice(profileSetup)).toContain(
      "$normalProfile = Join-Path $portableAppData $productName",
    );
  });

  it("AC-R9-06: builds both architectures for every platform download", async () => {
    const [builder, workflow] = await Promise.all([
      readFile(new URL("../../electron-builder.yml", import.meta.url), "utf8"),
      readFile(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8"),
    ]);

    expect(workflow).toContain("tags:\n      - \"v*\"");
    expect(workflow).toContain("npm run dist:${{ matrix.command }} -- --x64 --arm64");
    expect(builder).toContain("target: nsis\n      arch:\n        - x64\n        - arm64");
    expect(builder).toContain("target: zip\n      arch:\n        - x64\n        - arm64");
    expect(builder).toContain("target: dmg\n      arch:\n        - x64\n        - arm64");
    expect(builder).toContain("target: deb\n      arch:\n        - x64\n        - arm64");
    expect(builder).toContain("target: AppImage\n      arch:\n        - x64\n        - arm64");
  });

  it("AC-R9-06: drafts a release with checksums and changelog notes", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/release.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("sha256sum * > SHA256SUMS.txt");
    expect(workflow).toContain(
      "node scripts/extract-release-notes.mjs CHANGELOG.md \"$version\" release-notes.md",
    );
    expect(workflow).toContain("options=(--draft --notes-file release-notes.md)");
    expect(workflow).toContain("release-assets/*");
  });
});
