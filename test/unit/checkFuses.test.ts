import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { checkFuses } from "../../scripts/check-fuses.mjs";

async function fixtureWire(): Promise<Record<string, number | string>> {
  const fixturePath = path.resolve(__dirname, "../fixtures/fuses/secure-v1.json");
  return JSON.parse(await fs.readFile(fixturePath, "utf8")) as Record<string, number | string>;
}

describe("packaged Electron fuses", () => {
  it("AC-SEC-06: accepts a fixture wire with every required fuse state", async () => {
    const wire = await fixtureWire();
    const reader = vi.fn(async () => wire);

    await expect(checkFuses("fixture-electron", reader)).resolves.toBeUndefined();
    expect(reader).toHaveBeenCalledWith("fixture-electron");
  });

  it("AC-SEC-06: rejects a fixture wire with a mismatched fuse", async () => {
    const wire = { ...await fixtureWire(), 0: 49 };

    await expect(checkFuses("fixture-electron", async () => wire)).rejects.toThrow(
      /RunAsNode/,
    );
  });
});
