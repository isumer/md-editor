import type { CommandLine } from "electron";

// On macOS CI the Skia Graphite backend stalls the GPU process in raster
// flushes (DoEndRasterCHROMIUM::Flush, 140-180 ms) while new preview tiles
// scroll in, so the fling misses frames with the renderer idle. With Graphite
// off the same flings stay under the AC-PERF-09 frame budget. Linux and
// Windows did not show the stall, so their backend is left as Chromium ships it.
const MACOS_DISABLED_FEATURES = "SkiaGraphite";

/** Must run before the app is ready: Chromium reads these switches at GPU start. */
export function applyRenderingSwitches(
  commandLine: Pick<CommandLine, "appendSwitch">,
  platform: NodeJS.Platform,
): void {
  if (platform === "darwin") {
    commandLine.appendSwitch("disable-features", MACOS_DISABLED_FEATURES);
  }
}
