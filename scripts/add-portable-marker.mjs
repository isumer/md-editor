import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { archive } = require("app-builder-lib/out/targets/archive");

function unpackedDirectory(outDir, artifactPath) {
  const arm64 = path.basename(artifactPath).includes("-arm64-portable.zip");
  return path.join(outDir, arm64 ? "win-arm64-unpacked" : "win-unpacked");
}

async function rebuildPortableZip(outDir, artifactPath) {
  const appDirectory = unpackedDirectory(outDir, artifactPath);
  const markerPath = path.join(appDirectory, "portable");
  await fs.writeFile(markerPath, "", "utf8");
  try {
    await fs.unlink(artifactPath);
    await archive("zip", artifactPath, appDirectory, {
      withoutDir: true,
      preserveSymlinks: false,
    });
  } finally {
    await fs.rm(markerPath, { force: true });
  }
}

export async function afterAllArtifactBuild(result) {
  const portableZips = result.artifactPaths.filter((artifactPath) =>
    /-win-(x64|arm64)-portable\.zip$/u.test(artifactPath));
  await Promise.all(portableZips.map((artifactPath) =>
    rebuildPortableZip(result.outDir, artifactPath)));
}
