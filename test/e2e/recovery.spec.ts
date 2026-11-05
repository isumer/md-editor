import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  createUserDataDirectory,
  fixturePath,
  launchEditor,
  stubOpenDialog,
} from "./helpers";

test.describe.configure({ timeout: 30_000 });

async function copyFixture(): Promise<{ directory: string; document: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-recovery-"));
  const document = path.join(directory, "alpha.md");
  await fs.copyFile(fixturePath, document);
  return { directory, document };
}

async function appendText(page: Page, text: string): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

function tab(page: Page, name: string) {
  return page.locator(`[data-testid="tab"][data-name="${name}"]`);
}

async function openWithMenu(
  application: Awaited<ReturnType<typeof launchEditor>>["application"],
  page: Page,
  filePath: string,
): Promise<void> {
  await stubOpenDialog(application, filePath);
  await clickMenuItem(application, "file-open");
}

test("quitting with dirty tabs prompts, and Save writes every document", {
  tag: "@AC-R4-06",
  annotation: { type: "AC-R4-06" },
}, async () => {
  const { directory, document } = await copyFixture();
  const secondPath = path.join(directory, "second.md");
  await fs.writeFile(secondPath, "# Second\n", "utf8");
  const { application, page } = await launchEditor(document);
  try {
    await appendText(page, "QUIT-FIRST");
    await openWithMenu(application, page, secondPath);
    await appendText(page, "QUIT-SECOND");

    const closing = application.close();
    const prompt = page.getByTestId("close-prompt");
    await expect(prompt).toBeVisible();
    await expect(page.locator("#close-prompt-message")).toContainText("alpha.md");
    await expect(page.locator("#close-prompt-message")).toContainText("second.md");
    await prompt.getByRole("button", { name: "Save" }).click();
    await closing;

    await expect.poll(() => fs.readFile(document, "utf8")).toContain("QUIT-FIRST");
    await expect.poll(() => fs.readFile(secondPath, "utf8")).toContain("QUIT-SECOND");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("quitting with dirty tabs can discard without writing files", {
  tag: "@AC-R4-06",
  annotation: { type: "AC-R4-06" },
}, async () => {
  const { directory, document } = await copyFixture();
  const original = await fs.readFile(document, "utf8");
  const { application, page } = await launchEditor(document);
  try {
    await appendText(page, "DISCARD-ON-QUIT");

    const closing = application.close();
    const prompt = page.getByTestId("close-prompt");
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Discard" }).click();
    await closing;

    await expect.poll(() => fs.readFile(document, "utf8")).toBe(original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a renderer crash recovers the last draft", {
  tag: "@AC-R4-07",
  annotation: { type: "AC-R4-07" },
}, async () => {
  const { directory, document } = await copyFixture();
  const { application, page } = await launchEditor(document);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    await appendText(page, "DRAFT-MARKER");

    await expect.poll(async () => {
      const listed = await page.evaluate(() => window.api.listDrafts());
      return listed.ok && listed.value.drafts.some((draft) =>
        draft.text.includes("DRAFT-MARKER"));
    }, { timeout: 5_000 }).toBe(true);

    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
    });

    await expect(page.getByTestId("tab")).toHaveCount(1);
    await expect(tab(page, "alpha.md")).toHaveAttribute("aria-selected", "true");
    await expect(editor).toContainText("DRAFT-MARKER", { timeout: 10_000 });
    await expect(page.getByTestId("tab-dirty")).toBeVisible();
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("closing and reopening restores the session with its documents", {
  tag: "@AC-R4-08",
  annotation: { type: "AC-R4-08" },
}, async () => {
  const { directory, document } = await copyFixture();
  const secondPath = path.join(directory, "second.md");
  await fs.writeFile(secondPath, "# Second\n", "utf8");
  const userDataDir = await createUserDataDirectory();
  const first = await launchEditor(document, userDataDir);
  try {
    await appendText(first.page, "SESSION-FIRST");
    await openWithMenu(first.application, first.page, secondPath);
    await appendText(first.page, "SESSION-SECOND");

    const closing = first.application.close();
    await expect(first.page.getByTestId("close-prompt")).toBeVisible();
    await first.page.getByRole("button", { name: "Discard" }).click();
    await closing;
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }

  const second = await launchEditor(undefined, userDataDir);
  try {
    await expect(second.page.getByTestId("tab")).toHaveCount(2);
    await expect(tab(second.page, "alpha.md")).toHaveCount(1);
    await expect(tab(second.page, "second.md")).toHaveCount(1);

    await tab(second.page, "alpha.md").click();
    await expect(second.page.getByTestId("editor")).toContainText("SESSION-FIRST");
    await tab(second.page, "second.md").click();
    await expect(second.page.getByTestId("editor")).toContainText("SESSION-SECOND");
    await expect(second.page.getByTestId("tab-dirty")).toHaveCount(2);
  } finally {
    await closeEditor(second.application, second.page);
  }
});

test("a stuck render worker is restarted within 2.5 s and typing stays responsive", {
  tag: "@AC-R1-12",
  annotation: { type: "AC-R1-12" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("preview").locator("h1")).toHaveText("Sample document");
    const workers = page.workers();
    const renderWorker = workers.find((worker) => worker.url().includes("render")) ?? workers[0];
    expect(renderWorker).toBeDefined();

    // Start the bounded wait before the worker blocks, so the 2.5 s budget
    // covers the heartbeat miss and the restart.
    const badgeSeen = page.getByTestId("preview-error").waitFor({
      state: "visible",
      timeout: 2_500,
    });
    void renderWorker?.evaluate(() => {
      while (true) {
        // Occupy the worker so it cannot answer heartbeats.
      }
    }).catch(() => undefined);

    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("WATCHDOG");
    await expect(editor).toContainText("WATCHDOG", { timeout: 1_000 });

    await badgeSeen;
    expect(Date.now() - started).toBeLessThan(2_500);
    await expect(page.getByTestId("preview-error")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId("preview")).toContainText("WATCHDOG", { timeout: 10_000 });
  } finally {
    await closeEditor(application, page);
  }
});
