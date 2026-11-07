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

  it("AC-SEC-07: rejects non-objects, missing keys and accessor values", () => {
    expect(isExportPayloadRequest(null)).toBe(false);
    expect(isExportPayloadRequest("grant-a")).toBe(false);
    expect(isExportPayloadRequest([{ grant: "grant-a", bytes: new Uint8Array() }])).toBe(false);
    expect(isExportPayloadRequest({ grant: "grant-a" })).toBe(false);
    expect(isExportPayloadRequest({
      grant: "grant-a",
      get bytes() {
        return new Uint8Array();
      },
    })).toBe(false);
  });

  it("AC-SEC-07: rejects an object whose own keys cannot be read", () => {
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("no keys");
      },
    });

    expect(isExportPayloadRequest(hostile)).toBe(false);
  });

  it("AC-SEC-07: rejects an empty or oversized grant", () => {
    expect(isExportPayloadRequest({ grant: "", bytes: new Uint8Array() })).toBe(false);
    expect(isExportPayloadRequest({
      grant: "g".repeat(8 * 1024 + 1),
      bytes: new Uint8Array(),
    })).toBe(false);
  });

  it("AC-SEC-07: refuses to create a payload that fails validation", () => {
    expect(() => createExportPayload("", new Uint8Array())).toThrow("Invalid export payload");
  });

  it("AC-R6-01: hands an isolated byte copy to the future atomic writer", () => {
    const source = new Uint8Array([65, 66]);
    const payload = createExportPayload("grant-a", source);
    source[0] = 90;

    expect(payload).toEqual({ grant: "grant-a", bytes: new Uint8Array([65, 66]) });
  });
});
