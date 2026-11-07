import { describe, expect, it } from "vitest";

import {
  parseChecksum,
  parseReleaseFeed,
} from "../../src/shared/update/updatePolicy";

describe("update release feed policy", () => {
  it("AC-R9-07: returns version, URL and notes from an accepted feed", () => {
    expect(
      parseReleaseFeed({
        tag_name: "v1.2.3",
        html_url: "https://example.test/releases/1.2.3",
        body: "Release notes",
      }),
    ).toEqual({
      version: "v1.2.3",
      url: "https://example.test/releases/1.2.3",
      notes: "Release notes",
    });
  });

  it("AC-R9-07: rejects invalid feed shapes and values", () => {
    const getter = Object.defineProperty({}, "tag_name", {
      enumerable: true,
      get: () => "1.2.3",
    });
    Object.defineProperties(getter, {
      html_url: { enumerable: true, value: "https://example.test" },
      body: { enumerable: true, value: "notes" },
    });
    const throwingProxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("blocked");
        },
      },
    );
    const valid = {
      tag_name: "1.2.3",
      html_url: "https://example.test",
      body: "notes",
    };
    const invalid: unknown[] = [
      [],
      null,
      getter,
      throwingProxy,
      { tag_name: "1.2.3", html_url: "https://example.test" },
      { ...valid, extra: true },
      { ...valid, html_url: "http://example.test" },
      { ...valid, html_url: `https://${"x".repeat(2041)}` },
      { ...valid, body: "x".repeat(64 * 1024 + 1) },
    ];

    for (const value of invalid) {
      expect(parseReleaseFeed(value)).toBeNull();
    }
  });

  it("AC-R9-11: accepts checksum forms and returns lower-case digits", () => {
    const upper = "ABCDEF".repeat(10) + "ABCD";
    const lower = upper.toLowerCase();

    expect(parseChecksum(upper)).toBe(lower);
    expect(parseChecksum(`sha256:${upper}`)).toBe(lower);
  });

  it("AC-R9-11: rejects invalid checksum values", () => {
    expect(parseChecksum("a".repeat(63))).toBeNull();
    expect(parseChecksum(`sha512:${"a".repeat(64)}`)).toBeNull();
    expect(parseChecksum(42)).toBeNull();
  });
});
