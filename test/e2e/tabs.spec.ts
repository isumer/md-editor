import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import {
  closeEditor,
  clickMenuItem,
  launchEditor,
  launchSecondInstance,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

const PRIMARY_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
const DOCUMENT_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";
const DOCUMENT_START = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";

const tabsDirectory = path.join(repositoryRoot, "test/fixtures/tabs");
const alphaFixture = path.join(tabsDirectory, "alpha.md");
const betaFixture = path.join(tabsDirectory, "beta.md");

async function copyFixtures(): Promise<{ directory: string; alpha: string; beta: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-tabs-"));
  const alpha = path.join(directory, "alpha.md");
  const beta = path.join(directory, "beta.md");
  await fs.copyFile(alphaFixture, alpha);
  await fs.copyFile(betaFixture, beta);
  return { directory, alpha, beta };
}

function tab(page: Page, name: string) {
  return page.locator(`[data-testid="tab"][data-name="${name}"]`);
}

function dirtyMarker(page: Page, name: string) {
  return tab(page, name).getByTestId("tab-dirty");
}

async function openWithMenu(
  application: ElectronApplication,
  page: Page,
  filePath: string,
): Promise<void> {
  await stubOpenDialog(application, filePath);
  await clickMenuItem(application, "file-open");
}

function scroller(page: Page) {
  return page.getByTestId("editor").locator(".cm-scroller");
}

async function scrollEditorTo(page: Page, top: number): Promise<void> {
  await scroller(page).evaluate((element, value) => {
    element.scrollTop = value;
  }, top);
}

test("two tabs keep their own text, cursor, selection, scroll and undo history", {
  tag: "@AC-R4-01",
  annotation: { type: "AC-R4-01" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(900, 420);
    });
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("alpha-line-01");

    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.press("Enter");
    await page.keyboard.type("ALPHA-EDIT");
    await scrollEditorTo(page, 200);

    await openWithMenu(application, page, beta);
    await expect(editor).toContainText("beta-line-01");

    // Select the introduction line, then switch away and back: the selection
    // must stay so the next keystroke replaces it.
    await editor.click();
    await page.keyboard.press(DOCUMENT_START);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+End");
    await scrollEditorTo(page, 250);

    await tab(page, "alpha.md").click();
    await tab(page, "beta.md").click();
    await page.keyboard.type("BETA-SELECTED");
    await expect(editor).not.toContainText("Beta is the second of two tab fixtures");
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.press("Enter");
    await page.keyboard.type("BETA-END");

    await tab(page, "alpha.md").click();
    await expect(editor).toContainText("ALPHA-EDIT");
    await expect(editor).not.toContainText("BETA-END");
    await expect.poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(100);

    await tab(page, "beta.md").click();
    // The editor renders only the visited lines, so scroll to the top to read
    // the replacement and then return to the end for the next edit.
    await expect.poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(150);
    await page.keyboard.press(DOCUMENT_START);
    await expect(editor).toContainText("BETA-SELECTED");
    await page.keyboard.press(DOCUMENT_END);
    await expect(editor).toContainText("BETA-END");
    await page.keyboard.type("Z");
    await expect(editor).toContainText("BETA-ENDZ");
    await expect.poll(() => scroller(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(150);

    // Beta's undo history is beta's own.
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(editor).not.toContainText("BETA-END");
    await page.keyboard.press(DOCUMENT_START);
    await expect(editor).toContainText("beta-line-01");

    await tab(page, "alpha.md").click();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(editor).not.toContainText("ALPHA-EDIT");
    await page.keyboard.press(DOCUMENT_START);
    await expect(editor).toContainText("alpha-line-01");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("switching back reconnects the same preview blocks without appending", {
  tag: "@AC-R4-01",
  annotation: { type: "AC-R4-01" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  const preview = page.getByTestId("preview");
  try {
    await expect(preview.locator("h1")).toHaveText("Alpha");
    await preview.locator(".preview-block").evaluateAll((elements) => {
      (globalThis as typeof globalThis & { alphaBlocks?: Element[] }).alphaBlocks = elements;
    });

    await openWithMenu(application, page, beta);
    await expect(preview.locator("h1")).toHaveText("Beta");
    await page.evaluate(() => performance.clearMeasures("preview-append"));

    await tab(page, "alpha.md").click();
    await expect(preview.locator("h1")).toHaveText("Alpha");
    const sameNodes = await preview.locator(".preview-block").evaluateAll((elements) => {
      const saved = (globalThis as typeof globalThis & { alphaBlocks?: Element[] }).alphaBlocks;
      return saved?.length === elements.length && elements.every(
        (element, index) => element.isSameNode(saved[index] ?? null) && element.isConnected,
      );
    });
    expect(sameNodes).toBe(true);
    expect(await page.evaluate(() =>
      performance.getEntriesByName("preview-append").length)).toBe(0);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("switching back resumes an incomplete preview fill", {
  tag: "@AC-R4-01",
  annotation: { type: "AC-R4-01" },
}, async () => {
  // The paced fill (eight chunks per acknowledged batch) is still incomplete at
  // the switch; a loaded slow machine needs minutes to finish 2000 sections.
  test.setTimeout(360_000);
  const { directory, beta } = await copyFixtures();
  const large = path.join(directory, "large.md");
  const sections = Array.from({ length: 2_000 }, (_, index) =>
    `## Section ${String(index)}\n\nParagraph ${String(index)}.\n`).join("\n");
  await fs.writeFile(large, `# Large\n\n${sections}`, "utf8");
  const { application, page } = await launchEditor(large);
  const preview = page.getByTestId("preview");
  try {
    await expect(preview.locator(".preview-block").first()).toBeVisible();
    await expect(preview).toHaveAttribute("data-render-complete", "false");

    await openWithMenu(application, page, beta);
    await expect(preview.locator("h1")).toHaveText("Beta");
    await tab(page, "large.md").click();

    await expect(preview).toHaveAttribute("data-render-complete", "true", {
      timeout: 300_000,
    });
    await expect(preview).toContainText("Section 1999");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("opening a path that is already open focuses its tab without a duplicate", {
  tag: "@AC-R4-02",
  annotation: { type: "AC-R4-02" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, page, beta);
    await expect(page.getByTestId("tab")).toHaveCount(2);

    await openWithMenu(application, page, alpha);
    await expect(page.getByTestId("tab")).toHaveCount(2);
    await expect(tab(page, "alpha.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("editor")).toContainText("alpha-line-01");

    await launchSecondInstance(application, beta);
    await expect(page.getByTestId("tab")).toHaveCount(2);
    await expect(tab(page, "beta.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("editor")).toContainText("beta-line-01");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("only the dirty tab is marked, and saving or undoing clears it", {
  tag: "@AC-R4-03",
  annotation: { type: "AC-R4-03" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, page, beta);
    await tab(page, "alpha.md").click();
    const editor = page.getByTestId("editor").locator(".cm-content");
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("DIRTY-A");

    await expect(dirtyMarker(page, "alpha.md")).toBeVisible();
    await expect(dirtyMarker(page, "beta.md")).toBeHidden();

    // Undo returns to the saved text and clears the marker; redo sets it again.
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(dirtyMarker(page, "alpha.md")).toBeHidden();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+z`);
    await expect(dirtyMarker(page, "alpha.md")).toBeVisible();

    await page.keyboard.press(`${PRIMARY_MODIFIER}+s`);
    await expect(dirtyMarker(page, "alpha.md")).toBeHidden();
    await expect.poll(() => fs.readFile(alpha, "utf8")).toContain("DIRTY-A");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("closing a clean tab closes it with no prompt", {
  tag: "@AC-R4-04",
  annotation: { type: "AC-R4-04" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, page, beta);
    await expect(page.getByTestId("tab")).toHaveCount(2);

    await tab(page, "beta.md").getByTestId("tab-close").click();
    await expect(page.getByTestId("tab")).toHaveCount(1);
    await expect(page.getByTestId("close-prompt")).toBeHidden();
    await expect(page.getByTestId("editor")).toContainText("alpha-line-01");

    await tab(page, "alpha.md").getByTestId("tab-close").click();
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect(page.getByTestId("close-prompt")).toBeHidden();
    await expect(page).toHaveTitle(/Untitled/);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("closing a dirty tab honours Cancel, Discard and Save", {
  tag: "@AC-R4-05",
  annotation: { type: "AC-R4-05" },
}, async () => {
  const { directory, alpha } = await copyFixtures();
  const original = await fs.readFile(alpha, "utf8");
  const { application, page } = await launchEditor(alpha);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    const prompt = page.getByTestId("close-prompt");
    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("DISCARD-ME");

    await tab(page, "alpha.md").getByTestId("tab-close").click();
    await expect(prompt).toBeVisible();
    await expect(page.locator("#close-prompt-message")).toHaveText(
      "“alpha.md” has unsaved changes. Save before closing?",
    );
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByTestId("tab")).toHaveCount(1);
    await expect(editor).toContainText("DISCARD-ME");
    await expect(page).toHaveTitle(/•/);

    await tab(page, "alpha.md").getByTestId("tab-close").click();
    await prompt.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect.poll(() => fs.readFile(alpha, "utf8")).toBe(original);

    await openWithMenu(application, page, alpha);
    await expect(editor).toContainText("alpha-line-01");
    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("SAVE-ME");
    await tab(page, "alpha.md").getByTestId("tab-close").click();
    await prompt.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("tab")).toHaveCount(0);
    await expect.poll(() => fs.readFile(alpha, "utf8")).toContain("SAVE-ME");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("dropping a file onto the window opens it in a new tab", {
  tag: "@AC-R4-09",
  annotation: { type: "AC-R4-09" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await expect(page.getByTestId("editor")).toContainText("alpha-line-01");
    const session = await page.context().newCDPSession(page);
    const data = {
      items: [],
      files: [beta],
      dragOperationsMask: 1,
    };
    await session.send("Input.dispatchDragEvent", {
      type: "dragEnter",
      x: 400,
      y: 300,
      data,
    });
    await session.send("Input.dispatchDragEvent", {
      type: "drop",
      x: 400,
      y: 300,
      data,
    });
    await session.detach();

    await expect(page.getByTestId("tab")).toHaveCount(2);
    await expect(tab(page, "beta.md")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("editor")).toContainText("beta-line-01");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
