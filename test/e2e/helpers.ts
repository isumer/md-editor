import { promises as fs } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

// macOS uses Cmd (Meta) where Windows and Linux use Ctrl; chords follow the platform.
export const PRIMARY_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
export const DOCUMENT_START = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";
export const DOCUMENT_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

export const repositoryRoot = path.resolve(__dirname, "../..");
export const fixturePath = path.join(repositoryRoot, "test/fixtures/sample.md");
export const linkFixturePath = path.join(repositoryRoot, "test/fixtures/external-link.md");
export const unsafeHtmlFixturePath = path.join(repositoryRoot, "test/fixtures/unsafe-html.md");

export interface LaunchEditorOptions {
  // Runs after the first window exists and before the argv document is applied.
  // userDataDir is the profile launchEditor created and must remove on failure.
  onPage?: (editor: LaunchedEditor) => void;
  // Test-only override; the real bound is ARGV_TITLE_TIMEOUT_MS.
  titleTimeoutMs?: number;
}

// Bound by the 15_000 ms test timeout (the 2_000 ms expect timeout is separate):
// 10_000 ms leaves the cold-Windows margin that the old 2_000 ms setup wait lost.
const ARGV_TITLE_TIMEOUT_MS = 10_000;

export interface LaunchedEditor {
  application: ElectronApplication;
  page: Page;
  userDataDir: string;
}

export async function createUserDataDirectory(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "solidmd-userdata-"));
}

function launchEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== "ELECTRON_RUN_AS_NODE" && value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
}

const ARGV_TITLE_POLL_MS = 10;

async function waitForArgvDocument(
  page: Page,
  filePath: string,
  timeout: number,
): Promise<void> {
  const waitStarted = Date.now();
  const name = path.basename(filePath);
  // expect.poll backs off to 1 s between reads, so a startup measured
  // through it gains up to a second the app never spent. The title is
  // checked inside the page every 10 ms instead.
  await page
    .waitForFunction((expected) => document.title.includes(expected), name, {
      polling: ARGV_TITLE_POLL_MS,
      timeout,
    })
    .catch(async (error: unknown) => {
      const title = await page.title().catch(() => "<closed>");
      throw new Error(`argv document did not open: ${name} (title "${title}")`, { cause: error });
    });
  console.log(
    `argv title wait: ${String(Date.now() - waitStarted)} ms (${name})`,
  );
}

async function applyCpuThrottle(
  page: Page,
  configuredRate: string,
): Promise<void> {
  const rate = Number(configuredRate);
  if (!Number.isFinite(rate) || rate < 1) {
    throw new Error(
      "MDEDITOR_CPU_THROTTLE must be a number greater than or equal to 1",
    );
  }
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate });
}

export async function launchEditor(
  filePath?: string,
  optionsOrUserDataDir: LaunchEditorOptions | string = {},
): Promise<LaunchedEditor> {
  const options = typeof optionsOrUserDataDir === "string"
    ? {}
    : optionsOrUserDataDir;
  const userDataDir = typeof optionsOrUserDataDir === "string"
    ? optionsOrUserDataDir
    : undefined;
  // A unique profile per launch keeps session.json and Chromium state out of
  // other tests; a second launch for session restore passes the same path.
  const profileDirectory = userDataDir ?? await createUserDataDirectory();
  let application: ElectronApplication;
  try {
    application = await electron.launch({
      args: [
        `--user-data-dir=${profileDirectory}`,
        repositoryRoot,
        ...(filePath ? [filePath] : []),
      ],
      cwd: repositoryRoot,
      env: launchEnvironment(),
    });
  } catch (error) {
    await removeProfileDirectory(profileDirectory);
    throw error;
  }
  try {
    const page = await application.firstWindow();
    const configuredCpuThrottle = process.env["MDEDITOR_CPU_THROTTLE"];
    if (configuredCpuThrottle !== undefined) {
      await applyCpuThrottle(page, configuredCpuThrottle);
    }
    // Runs before the argv document is applied, so startup traffic is observable.
    options.onPage?.({ application, page, userDataDir: profileDirectory });
    if (filePath) {
      await waitForArgvDocument(
        page,
        filePath,
        options.titleTimeoutMs ?? ARGV_TITLE_TIMEOUT_MS,
      );
    }
    return { application, page, userDataDir: profileDirectory };
  } catch (error) {
    try {
      await application.close();
    } catch {
      // Best effort: the original failure is the one the caller must see.
    }
    await removeProfileDirectory(profileDirectory);
    throw error;
  }
}

const PROFILE_PREFIX = "solidmd-userdata-";

// A crashed Playwright page cannot be reused, but the window reloads. Execute
// an expression in the live renderer through the main process instead.
export async function evaluateInWindow<T>(
  application: ElectronApplication,
  expression: string,
): Promise<T | null> {
  try {
    return await application.evaluate(async ({ BrowserWindow }, source) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      if (!contents) {
        return null;
      }
      return contents.executeJavaScript(source, true);
    }, expression) as T | null;
  } catch {
    return null;
  }
}

export async function removeProfileDirectory(profileDirectory: string): Promise<void> {
  if (!path.basename(profileDirectory).startsWith(PROFILE_PREFIX)) {
    return;
  }
  // A child process can recreate the directory just after removal. Remove it
  // again until it stays gone.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await fs.rm(profileDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    const exists = await fs.stat(profileDirectory).then(
      () => true,
      () => false,
    );
    if (!exists) {
      return;
    }
  }
}

// A dirty document makes the window-close path show the in-page prompt, so
// tests must answer it before the process exits.
export async function closeEditor(
  application: ElectronApplication,
  page: Page,
): Promise<void> {
  const profileDirectory = await application.evaluate(
    ({ app }) => app.getPath("userData"),
  ).catch(() => null);
  // Read the process before close: Playwright drops the connection on close.
  const child = application.process();
  try {
    const closing = application.close();
    const prompt = page.getByTestId("close-prompt");
    const outcome = await Promise.race([
      prompt.waitFor({ state: "visible" }).then(() => "prompt" as const).catch(
        () => "closed" as const,
      ),
      closing.then(() => "closed" as const),
    ]);
    if (outcome === "prompt") {
      await prompt.getByRole("button", { name: "Discard" }).click();
    }
    await closing;
  } finally {
    if (profileDirectory !== null) {
      await waitForProcessExit(child);
      await removeProfileDirectory(profileDirectory);
    }
  }
}

// Electron can recreate the profile directory during shutdown. Wait for the
// process to exit, so no child process writes it after removal.
async function waitForProcessExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 5_000);
    }),
  ]);
}

export async function closeCrashedEditor(
  application: ElectronApplication,
): Promise<void> {
  const profileDirectory = await application.evaluate(
    ({ app }) => app.getPath("userData"),
  ).catch(() => null);
  const exited = new Promise<void>((resolve) => {
    application.process().once("exit", () => resolve());
  });
  await application.evaluate(({ app }) => {
    app.exit(0);
  }).catch(() => undefined);
  await Promise.race([
    exited,
    new Promise<void>((resolve) => {
      setTimeout(resolve, 5_000);
    }),
  ]);
  if (profileDirectory !== null) {
    await removeProfileDirectory(profileDirectory);
  }
}

export async function launchSecondInstance(
  application: ElectronApplication,
  filePath: string,
): Promise<void> {
  const executable = await application.evaluate(({ app }) => app.getPath("exe"));
  const profileDirectory = await application.evaluate(({ app }) => app.getPath("userData"));
  const environment = { ...process.env };
  delete environment["ELECTRON_RUN_AS_NODE"];
  // Same flags Playwright gives the first instance; window sandboxing (webPreferences) is unaffected.
  const child = spawn(executable, [
    "--no-sandbox",
    `--user-data-dir=${profileDirectory}`,
    repositoryRoot,
    filePath,
  ], {
    cwd: repositoryRoot,
    env: environment,
    stdio: "ignore",
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`Second instance exited with code ${String(code)}`)));
  });
}

export async function clickMenuItem(
  application: ElectronApplication,
  menuItemId: string,
): Promise<void> {
  // The renderer contributes the File action items after it has wired its commands.
  await expect.poll(
    () => application.evaluate(({ Menu }, id) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById(id)), menuItemId),
    { timeout: 5_000 },
  ).toBe(true);
  const clicked = await application.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!item) {
      return false;
    }
    item.click();
    return true;
  }, menuItemId);
  if (!clicked) {
    throw new Error(`Missing menu item: ${menuItemId}`);
  }
}

export async function stubOpenDialog(
  application: ElectronApplication,
  filePath: string | null,
): Promise<void> {
  await application.evaluate(({ dialog }, selectedPath) => {
    const probe = globalThis as typeof globalThis & { openDialogCalls?: number };
    probe.openDialogCalls = 0;
    dialog.showOpenDialog = async () => {
      probe.openDialogCalls = (probe.openDialogCalls ?? 0) + 1;
      return selectedPath === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [selectedPath] };
    };
  }, filePath);
}

export async function stubSaveDialog(
  application: ElectronApplication,
  filePath: string | null,
): Promise<void> {
  await application.evaluate(({ dialog }, selectedPath) => {
    const probe = globalThis as typeof globalThis & { saveDialogCalls?: number };
    probe.saveDialogCalls = 0;
    dialog.showSaveDialog = async () => {
      probe.saveDialogCalls = (probe.saveDialogCalls ?? 0) + 1;
      return selectedPath === null
        ? { canceled: true, filePath: "" }
        : { canceled: false, filePath: selectedPath };
    };
  }, filePath);
}

export async function dialogCallCount(
  application: ElectronApplication,
  kind: "open" | "save",
): Promise<number> {
  return application.evaluate((_, dialogKind) => {
    const probe = globalThis as typeof globalThis & {
      openDialogCalls?: number;
      saveDialogCalls?: number;
    };
    return dialogKind === "open"
      ? (probe.openDialogCalls ?? 0)
      : (probe.saveDialogCalls ?? 0);
  }, kind);
}

// expect.poll does not retry a callback that throws, so a not-yet-written file must read as null.
export async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
