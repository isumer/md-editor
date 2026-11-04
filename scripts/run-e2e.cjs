const { spawnSync } = require("node:child_process");

// Run Playwright's JS entry with node: Windows refuses to spawn .cmd shims without a shell.
const playwrightCli = require.resolve("@playwright/test/cli");
const playwright = [process.execPath, playwrightCli, "test", ...process.argv.slice(2)];
const needsDisplay = process.platform === "linux" && !process.env.DISPLAY;
const [command, ...args] = needsDisplay ? ["xvfb-run", "-a", ...playwright] : playwright;
const result = spawnSync(command, args, { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
