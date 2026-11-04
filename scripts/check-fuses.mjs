import { FuseV1Options, FuseVersion, getCurrentFuseWire } from "@electron/fuses";
import { pathToFileURL } from "node:url";

const EXPECTED = new Map([
  [FuseV1Options.RunAsNode, 48],
  [FuseV1Options.EnableCookieEncryption, 49],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, 48],
  [FuseV1Options.EnableNodeCliInspectArguments, 48],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, 49],
  [FuseV1Options.OnlyLoadAppFromAsar, 49],
]);

export async function checkFuses(binaryPath, reader = getCurrentFuseWire) {
  const wire = await reader(binaryPath);
  if (wire.version !== FuseVersion.V1) {
    throw new Error(`Expected fuse wire v1, received ${String(wire.version)}`);
  }
  for (const [option, expected] of EXPECTED) {
    if (wire[option] !== expected) {
      throw new Error(
        `${FuseV1Options[option]} expected ${expected}, received ${String(wire[option])}`,
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const binaryPath = process.argv[2];
  if (!binaryPath) {
    throw new Error("Usage: node scripts/check-fuses.mjs <binary-or-app>");
  }
  await checkFuses(binaryPath);
}
