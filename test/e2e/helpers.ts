import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

export const repositoryRoot = path.resolve(__dirname, "../..");
export const fixturePath = path.join(repositoryRoot, "test/fixtures/sample.md");
export const linkFixturePath = path.join(repositoryRoot, "test/fixtures/external-link.md");
export const unsafeHtmlFixturePath = path.join(repositoryRoot, "test/fixtures/unsafe-html.md");

export interface LaunchedEditor {
  application: ElectronApplication;
  page: Page;
  userDataDir: string;
}

export async function createUserDataDirectory(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-userdata-"));
}

export async function launchEditor(
  filePath?: string,
  userDataDir?: string,
): Promise<LaunchedEditor> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== "ELECTRON_RUN_AS_NODE" && value !== undefined) {
      environment[name] = value;
    }
  }
  // A unique profile per launch keeps session.json and Chromium state out of
  // other tests; a second launch for session restore passes the same path.
  const profileDirectory = userDataDir ?? await createUserDataDirectory();
  const application = await electron.launch({
    args: [
      `--user-data-dir=${profileDirectory}`,
      repositoryRoot,
      ...(filePath ? [filePath] : []),
    ],
    cwd: repositoryRoot,
    env: environment,
  });
  return { application, page: await application.firstWindow(), userDataDir: profileDirectory };
}

// A dirty document makes the window-close path show the in-page prompt, so
// tests must answer it before the process exits.
export async function closeEditor(
  application: ElectronApplication,
  page: Page,
): Promise<void> {
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
