export const BINARY_SAMPLE_BYTES = 8192;

const UTF8_BOM_BYTES = [0xef, 0xbb, 0xbf] as const;
const UTF16_BOMS = [
  [0xff, 0xfe],
  [0xfe, 0xff],
] as const;

function startsWithBom(bytes: Uint8Array): boolean {
  const matches = (bom: readonly number[]): boolean =>
    bom.every((byte, index) => bytes[index] === byte);

  return matches(UTF8_BOM_BYTES) || UTF16_BOMS.some((bom) => matches(bom));
}

export function isBinarySample(bytes: Uint8Array): boolean {
  if (startsWithBom(bytes)) {
    return false;
  }

  const end = Math.min(bytes.length, BINARY_SAMPLE_BYTES);
  for (let index = 0; index < end; index += 1) {
    if (bytes[index] === 0x00) {
      return true;
    }
  }

  return false;
}
