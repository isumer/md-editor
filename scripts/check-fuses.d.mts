export type FuseWire = Record<string, number | string>;
export type FuseReader = (binaryPath: string) => Promise<FuseWire>;

export function checkFuses(
  binaryPath: string,
  reader?: FuseReader,
): Promise<void>;
