import { describe, expect, it } from "vitest";

import {
  createExportPayload,
  isExportPayloadRequest,
} from "../../src/main/export/payload";

describe("export payload boundary", () => {
  it("AC-SEC-07: accepts only an exact grant and byte payload", () => {
    expect(isExportPayloadRequest({ grant: "grant-a", bytes: new Uint8Array([1, 2]) }))
      .toBe(true);
    expect(isExportPayloadRequest({ grant: "grant-a", bytes: [1, 2] })).toBe(false);
    expect(isExportPayloadRequest({ grant: "grant-a", bytes: new Uint8Array(), extra: true }))
      .toBe(false);
  });

  it("AC-R6-01: hands an isolated byte copy to the future atomic writer", () => {
    const source = new Uint8Array([65, 66]);
    const payload = createExportPayload("grant-a", source);
    source[0] = 90;

    expect(payload).toEqual({ grant: "grant-a", bytes: new Uint8Array([65, 66]) });
  });
});
