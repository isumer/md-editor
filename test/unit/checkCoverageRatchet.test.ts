import { describe, expect, it } from "vitest";

import {
  checkCoverageRatchet,
  formatCoverageReport,
} from "../../scripts/check-coverage-ratchet.mjs";

function summary(percentages: Record<string, number>) {
  return {
    total: Object.fromEntries(
      Object.entries(percentages).map(([metric, pct]) => [metric, { pct }]),
    ),
  };
}

const baseline = {
  statements: 90,
  branches: 85,
  functions: 95,
  lines: 91,
};

describe("coverage ratchet", () => {
  it("accepts coverage at the baseline or no more than 0.1 points below it", () => {
    const result = checkCoverageRatchet(summary({
      statements: 89.9,
      branches: 85,
      functions: 96,
      lines: 91,
    }), baseline);

    expect(result.ok).toBe(true);
    expect(formatCoverageReport(result)).toContain("| statements | 90.00% | 89.90% | pass |");
  });

  it("rejects a coverage regression larger than 0.1 points", () => {
    const result = checkCoverageRatchet(summary({
      statements: 89.89,
      branches: 85,
      functions: 95,
      lines: 91,
    }), baseline);

    expect(result.ok).toBe(false);
    expect(result.rows.find((row) => row.metric === "statements")?.result).toBe("regression");
  });

  it("rejects a fixture with a missing metric", () => {
    expect(() => checkCoverageRatchet(summary({
      statements: 90,
      branches: 85,
      functions: 95,
    }), baseline)).toThrow("Missing numeric lines coverage");
  });
});
