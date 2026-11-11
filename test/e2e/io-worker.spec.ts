import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  dialogCallCount,
  fixturePath,
  launchEditor,
  readTextOrNull,
  stubOpenDialog,
  stubSaveDialog,
} from "./helpers";

async function ioWorkerPid(application: ElectronApplication): Promise<number | null> {
  return application.evaluate(({ app }) => {
    const worker = app.getAppMetrics().find((metric) =>
      metric.type === "Utility" &&
      (metric.name === "io-worker" || metric.serviceName === "io-worker"));
    return worker?.pid ?? null;
  });
}

async function appendEditorText(page: Page, text: string): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

test("saving succeeds after the io-worker restarts", {
  tag: "@AC-R5-17",
  annotation: { type: "AC-R5-17" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-restart-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  const { application, page } = await launchEditor(currentPath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    const edit = "\n\nsaved after worker restart";
    await appendEditorText(page, edit);
    const previousPid = await ioWorkerPid(application);
    expect(previousPid).not.toBeNull();

    process.kill(previousPid as number, "SIGKILL");
    let stableObservations = 0;
    let observedPid: number | null = null;
    await expect.poll(async () => {
      const pid = await ioWorkerPid(application);
      stableObservations = pid !== null && pid !== previousPid && pid === observedPid
        ? stableObservations + 1
        : 1;
      observedPid = pid;
      return stableObservations >= 2 && pid !== previousPid ? pid : null;
    }).not.toBeNull();
    await stubSaveDialog(application, null);
    await clickMenuItem(application, "file-save");

    await expect.poll(() => readTextOrNull(currentPath)).toBe(originalText + edit);
    await expect(page).not.toHaveTitle(/•/);
    expect(await dialogCallCount(application, "save")).toBe(0);
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

// SIGSTOP holds the write in the port so the crash lands while the save is in flight.
if (process.platform !== "win32") {
  test("a save in flight when the io-worker dies fails retryably and stays unsaved", {
    tag: "@AC-R5-17",
    annotation: { type: "AC-R5-17" },
  }, async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-in-flight-"));
    const currentPath = path.join(temporaryDirectory, "current.md");
    await fs.writeFile(currentPath, "# Current\n", "utf8");
    const { application, page } = await launchEditor(currentPath);
    try {
      await expect(page.getByTestId("editor")).toContainText("Current");
      await appendEditorText(page, "\nlost in flight");
      const pid = await ioWorkerPid(application);
      expect(pid).not.toBeNull();

      process.kill(pid as number, "SIGSTOP");
      await clickMenuItem(application, "file-save");
      // Menu commands reach the renderer in order: once Open's dialog runs, Save has posted its write.
      await stubOpenDialog(application, null);
      await clickMenuItem(application, "file-open");
      await expect.poll(() => dialogCallCount(application, "open")).toBe(1);
      process.kill(pid as number, "SIGKILL");

      await expect(page.getByTestId("status"))
        .toHaveText("Could not save “current.md”: the file service restarted. Try again.");
      await expect(page).toHaveTitle(/^• current\.md/);
      expect(await fs.readFile(currentPath, "utf8")).toBe("# Current\n");
    } finally {
      await closeEditor(application, page);
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}

test("an argv file is editable within the cold-start budget", {
  tag: "@AC-PERF-03",
  annotation: { type: "AC-PERF-03" },
}, async () => {
  const startedAt = performance.now();
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" cold-start-ready");
    await expect(editor).toContainText("cold-start-ready");

    expect(performance.now() - startedAt).toBeLessThan(2_000);
  } finally {
    await closeEditor(application, page);
  }
});
