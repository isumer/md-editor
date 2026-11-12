import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function run(command, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, options);
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve(output)
      : reject(new Error(`${command} exited ${String(code)}\n${output}`)));
  });
}

// Where unprivileged user namespaces are restricted (Ubuntu 24.04), Chromium needs a setuid helper.
async function enableSandboxHelper(helperPath) {
  try {
    await run("sudo", ["-n", "chown", "root:root", helperPath], {});
    await run("sudo", ["-n", "chmod", "4755", helperPath], {});
  } catch {
    // Without sudo the namespace sandbox is used; if that is unavailable the launch fails loudly.
  }
}

async function smoke(appImagePath, fixturePath) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "solidmd-appimage-"));
  try {
    await run(appImagePath, ["--appimage-extract"], { cwd: temporaryDirectory });
    const root = path.join(temporaryDirectory, "squashfs-root");
    await enableSandboxHelper(path.join(root, "chrome-sandbox"));
    // Never --no-sandbox: the smoke test must run the app as users get it.
    // Own process group so the whole Electron tree can be stopped; the caller provides DISPLAY.
    const child = spawn(path.join(root, "AppRun"), [fixturePath], {
      env: { ...process.env, APPIMAGE: appImagePath },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    if (child.exitCode !== null) {
      throw new Error(`AppImage exited before five seconds\n${output}`);
    }
    // Ask the main process to quit so it shuts its helpers down in order; signalling the
    // whole group kills the GPU process first and the main process then aborts.
    child.kill("SIGTERM");
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
    ]);
    if (!stopped) {
      process.kill(-child.pid, "SIGKILL");
      throw new Error(`AppImage did not quit within ten seconds of SIGTERM\n${output}`);
    }
    if (/uncaughtException|unhandledRejection|fatal/iu.test(output)) {
      throw new Error(`Fatal output from AppImage\n${output}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const [appImagePath, fixturePath] = process.argv.slice(2);
if (!appImagePath || !fixturePath) {
  throw new Error("Usage: node scripts/smoke-appimage.mjs <AppImage> <fixture>");
}
await smoke(path.resolve(appImagePath), path.resolve(fixturePath));
