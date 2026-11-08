import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
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

export interface LaunchEditorOptions {
  // Runs after the first window exists and before the argv document is applied.
  onPage?: (editor: { application: ElectronApplication; page: Page }) => void;
  // Test-only override; the real bound is ARGV_TITLE_TIMEOUT_MS.
  titleTimeoutMs?: number;
}

// Bound by the 15_000 ms test timeout (the 2_000 ms expect timeout is separate):
// 10_000 ms leaves the cold-Windows margin that the old 2_000 ms setup wait lost.
const ARGV_TITLE_TIMEOUT_MS = 10_000;

export async function launchEditor(
  filePath?: string,
  options: LaunchEditorOptions = {},
): Promise<{
  application: ElectronApplication;
  page: Page;
}> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== "ELECTRON_RUN_AS_NODE" && value !== undefined) {
      environment[name] = value;
    }
  }
  const application = await electron.launch({
    args: filePath ? [repositoryRoot, filePath] : [repositoryRoot],
    cwd: repositoryRoot,
    env: environment,
  });
  try {
    const page = await application.firstWindow();
    // Runs before the argv document is applied, so startup traffic is observable.
    options.onPage?.({ application, page });
    if (filePath) {
      const waitStarted = Date.now();
      await expect.poll(
        () => page.title(),
        {
          message: `argv document did not open: ${path.basename(filePath)}`,
          timeout: options.titleTimeoutMs ?? ARGV_TITLE_TIMEOUT_MS,
        },
      ).toContain(path.basename(filePath));
      console.log(
        `argv title wait: ${String(Date.now() - waitStarted)} ms (${path.basename(filePath)})`,
      );
    }
    return { application, page };
  } catch (error) {
    try {
      await application.close();
    } catch {
      // Best effort: the original failure is the one the caller must see.
    }
    throw error;
  }
}

export async function launchSecondInstance(
  application: ElectronApplication,
  filePath: string,
): Promise<void> {
  const executable = await application.evaluate(({ app }) => app.getPath("exe"));
  const environment = { ...process.env };
  delete environment["ELECTRON_RUN_AS_NODE"];
  // Same flag Playwright gives the first instance; window sandboxing (webPreferences) is unaffected.
  const child = spawn(executable, ["--no-sandbox", repositoryRoot, filePath], {
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
