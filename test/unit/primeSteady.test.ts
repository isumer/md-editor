import { describe, expect, it } from "vitest";

import { isSteady } from "../e2e/prime-steady";

describe("e2e machine prime", () => {
  it("keeps priming while a round is much faster than the one before", () => {
    expect(isSteady(11_676, 4_643)).toBe(false);
  });

  it("stops once two rounds agree within a quarter", () => {
    expect(isSteady(2_705, 2_420)).toBe(true);
    expect(isSteady(2_000, 2_500)).toBe(true);
  });

  it("does not call a slower round steady past the ratio", () => {
    expect(isSteady(2_000, 2_501)).toBe(false);
  });
});
