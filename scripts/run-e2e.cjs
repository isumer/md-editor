const { spawnSync } = require("node:child_process");
const path = require("node:path");

const playwright = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);
const needsDisplay = process.platform === "linux" && !process.env.DISPLAY;
const command = needsDisplay ? "xvfb-run" : playwright;
const args = needsDisplay ? ["-a", playwright, "test"] : ["test"];
const result = spawnSync(command, args, { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
