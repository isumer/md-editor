import { createRequire } from "node:module";
import path from "node:path";

import {
  cruise,
  type IConfiguration,
  type ICruiseResult,
} from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../../.dependency-cruiser.cjs") as IConfiguration;
const fixtureRoot = path.resolve("test/fixtures/depcruise");

async function violatedRules(fixture: string): Promise<readonly string[]> {
  const result = await cruise([path.join(fixtureRoot, fixture)], {
    ...config.options,
    outputType: "json",
    validate: true,
    ruleSet: {
      forbidden: config.forbidden,
      allowed: config.allowed,
      allowedSeverity: config.allowedSeverity,
      required: config.required,
    },
  });
  if (typeof result.output !== "string") {
    throw new Error("Expected dependency-cruiser JSON output");
  }
  const output = JSON.parse(result.output) as ICruiseResult;
  return output.summary.violations.map((violation) => violation.rule.name);
}

describe("dependency rules", () => {
  it.each([
    ["feature-to-feature", "no-feature-to-feature"],
    ["core-to-view", "core-no-codemirror-view"],
    ["renderer-to-node", "renderer-no-node"],
    ["shared-to-anything", "shared-no-dependencies"],
    ["cycle", "no-circular"],
  ])("%s fixture fires %s", async (fixture, expectedRule) => {
    const rules = await violatedRules(fixture);

    expect(rules).toContain(expectedRule);
  });

  it("lets a feature import files in its own folder", async () => {
    // Guards the backreference in no-feature-to-feature: a broken group number flags every own-folder import.
    const rules = await violatedRules("own-feature-folder");

    expect(rules).not.toContain("no-feature-to-feature");
  });

  it("counts a generic feature-to-feature import exactly once", async () => {
    const result = await violatedRules("feature-to-feature");

    expect(result.filter((rule) => rule === "no-feature-to-feature")).toHaveLength(1);
  });
});
