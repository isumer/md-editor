import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAllowedLicenses,
  isAllowedLicenseExpression,
} from "../../scripts/third-party-notices.mjs";

interface LicenseFixture {
  allowed: string[];
  rejected: string[];
}

async function readFixture(name: string): Promise<LicenseFixture> {
  const fixturePath = path.resolve(__dirname, `../fixtures/licenses/${name}.json`);
  return JSON.parse(await fs.readFile(fixturePath, "utf8")) as LicenseFixture;
}

describe("third-party licence policy", () => {
  it("AC-R9-05: accepts every GPL-3-compatible allowlisted licence", async () => {
    const fixture = await readFixture("compatible");

    expect(fixture.allowed.every(isAllowedLicenseExpression)).toBe(true);
  });

  it("AC-R9-05: accepts an SPDX OR expression when any branch is allowed", async () => {
    const fixture = await readFixture("or-expressions");

    expect(fixture.allowed.every(isAllowedLicenseExpression)).toBe(true);
    expect(fixture.rejected.some(isAllowedLicenseExpression)).toBe(false);
  });

  it("AC-R9-05: rejects a GPL-incompatible production dependency fixture", async () => {
    const fixture = await readFixture("incompatible");

    expect(() => assertAllowedLicenses([
      { name: "incompatible-package", version: "1.0.0", license: fixture.rejected[0] },
    ])).toThrow(/SSPL-1\.0/);
  });
});
