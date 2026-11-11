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
});
