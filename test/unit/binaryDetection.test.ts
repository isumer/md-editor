import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BINARY_SAMPLE_BYTES,
  isBinarySample,
} from "../../src/shared/text/binary";

function fixture(name: string): Uint8Array {
  return readFileSync(new URL(`../fixtures/binary/${name}`, import.meta.url));
}

function asciiSampleWithNulAt(index: number): Uint8Array {
  const bytes = new Uint8Array(index + 1).fill(0x61);
  bytes[index] = 0x00;
  return bytes;
}

describe("AC-R12-01: binary detection from the first bytes", () => {
  it("AC-R12-01: a NUL byte at offset 0x10 marks the file binary", () => {
    const bytes = fixture("nul-byte.bin");

    expect(isBinarySample(bytes)).toBe(true);
  });

  it("AC-R12-01: a NUL byte as the first byte marks the file binary", () => {
    const bytes = fixture("nul-at-start.bin");

    expect(isBinarySample(bytes)).toBe(true);
  });

  it("AC-R12-01: a PNG with NUL bytes marks the file binary", () => {
    const bytes = fixture("tiny.png");

    expect(isBinarySample(bytes)).toBe(true);
  });

  it("AC-R12-01: a UTF-16LE BOM keeps the file textual despite NUL bytes", () => {
    const bytes = fixture("utf16le-bom.txt");

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: invalid UTF-8 alone does not mark the file binary", () => {
    const bytes = fixture("invalid-utf8.bin");

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: a Markdown sample is textual", () => {
    const bytes = readFileSync(new URL("../fixtures/sample.md", import.meta.url));

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: an empty sample is textual", () => {
    const bytes = new Uint8Array(0);

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: a NUL at the last sampled index marks the buffer binary", () => {
    const bytes = asciiSampleWithNulAt(BINARY_SAMPLE_BYTES - 1);

    expect(isBinarySample(bytes)).toBe(true);
  });

  it("AC-R12-01: a NUL at index 8192 outside the sample is ignored", () => {
    const bytes = asciiSampleWithNulAt(BINARY_SAMPLE_BYTES);

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: a UTF-16BE BOM keeps a sample with a NUL byte textual", () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41]);

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: a UTF-8 BOM keeps a sample with a NUL byte textual", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x00]);

    expect(isBinarySample(bytes)).toBe(false);
  });

  it("AC-R12-01: a single 0xff byte is textual", () => {
    const bytes = new Uint8Array([0xff]);

    expect(isBinarySample(bytes)).toBe(false);
  });
});
