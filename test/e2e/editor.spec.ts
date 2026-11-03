import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

const repositoryRoot = path.resolve(__dirname, "../..");
const fixturePath = path.join(repositoryRoot, "test/fixtures/sample.md");
const linkFixturePath = path.join(repositoryRoot, "test/fixtures/external-link.md");
const unsafeHtmlFixturePath = path.join(repositoryRoot, "test/fixtures/unsafe-html.md");

async function launchEditor(filePath: string): Promise<{
  application: ElectronApplication;
  page: Page;
}> {
  const application = await electron.launch({
    args: [repositoryRoot, filePath],
    cwd: repositoryRoot,
  });
  return { application, page: await application.firstWindow() };
}

test("opens an argv file and renders its heading", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("preview").locator("h1")).toHaveText(
      "Sample document",
      { timeout: 2_000 },
    );
  } finally {
    await application.close();
  }
});

test("shows the window after it is ready", async () => {
  const { application } = await launchEditor(fixturePath);
  try {
    await expect.poll(
      () => application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
      ),
      { timeout: 2_000 },
    ).toBe(true);
  } finally {
    await application.close();
  }
});

test("exposes stable File menu items with their accelerators", async () => {
  const { application } = await launchEditor(fixturePath);
  try {
    const menuItems = await application.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return ["file-open", "file-save", "file-save-as"].map((id) => {
        const item = menu?.getMenuItemById(id);
        return { id: item?.id, accelerator: item?.accelerator };
      });
    });

    expect(menuItems).toEqual([
      { id: "file-open", accelerator: "CmdOrCtrl+O" },
      { id: "file-save", accelerator: "CmdOrCtrl+S" },
      { id: "file-save-as", accelerator: "CmdOrCtrl+Shift+S" },
    ]);
  } finally {
    await application.close();
  }
});

test("updates the preview after editing", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n\n## Added");

    await expect(page.getByTestId("preview").locator("h2")).toHaveText("Added", {
      timeout: 1_000,
    });
  } finally {
    await application.close();
  }
});

test("saves edits atomically and clears the dirty marker", async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-e2e-"));
  const copiedFile = path.join(temporaryDirectory, "sample.md");
  await fs.copyFile(fixturePath, copiedFile);
  const { application, page } = await launchEditor(copiedFile);

  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n\nsaved text");
    await expect(page).toHaveTitle(/•/);

    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById("file-save")!.click(),
    );

    await expect.poll(() => fs.readFile(copiedFile, "utf8")).toContain("saved text");
    await expect(page).not.toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("opens external preview links outside the editor", async () => {
  const { application, page } = await launchEditor(linkFixturePath);
  try {
    await application.evaluate(({ shell }) => {
      const probe = globalThis as typeof globalThis & { externalUrls?: string[] };
      probe.externalUrls = [];
      shell.openExternal = async (url) => {
        probe.externalUrls?.push(url);
      };
    });
    const editor = page.getByTestId("editor").locator(".cm-content");
    // Capture only after the fixture is loaded, or the baseline is the empty startup editor.
    await expect(editor).toContainText("# External link");
    const originalEditorText = await editor.textContent();
    const originalWindowUrl = page.url();

    await page.getByTestId("preview").getByRole("link", { name: "Example" }).click();

    await expect.poll(() =>
      application.evaluate(() =>
        (globalThis as typeof globalThis & { externalUrls?: string[] }).externalUrls,
      ),
    ).toEqual(["https://example.com/"]);
    expect(page.url()).toBe(originalWindowUrl);
    await expect(editor).toHaveText(originalEditorText ?? "");
  } finally {
    await application.close();
  }
});

test("blocks javascript preview links without opening or navigating", async () => {
  const { application, page } = await launchEditor(linkFixturePath);
  try {
    await application.evaluate(({ shell }) => {
      const probe = globalThis as typeof globalThis & { externalUrls?: string[] };
      probe.externalUrls = [];
      shell.openExternal = async (url) => {
        probe.externalUrls?.push(url);
      };
    });
    const unsafeLink = page.getByTestId("preview").locator("a", {
      hasText: "Unsafe script",
    });
    await expect(unsafeLink).not.toHaveAttribute("href");
    await unsafeLink.evaluate((link) => link.setAttribute("href", "javascript:alert(1)"));
    let dialogOpened = false;
    page.once("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });
    const originalWindowUrl = page.url();

    await unsafeLink.click();

    await expect(page.getByTestId("status")).toHaveText(
      "Cannot open link: javascript:alert(1)",
    );
    expect(dialogOpened).toBe(false);
    expect(page.url()).toBe(originalWindowUrl);
    await expect.poll(() =>
      application.evaluate(() =>
        (globalThis as typeof globalThis & { externalUrls?: string[] }).externalUrls,
      ),
    ).toEqual([]);
  } finally {
    await application.close();
  }
});

test("scrolls preview anchors without navigating the window", async () => {
  const { application, page } = await launchEditor(linkFixturePath);
  try {
    const preview = page.getByTestId("preview");
    const originalWindowUrl = page.url();

    await preview.getByRole("link", { name: "Jump to target" }).click();

    await expect.poll(() => preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(page.url()).toBe(originalWindowUrl);
  } finally {
    await application.close();
  }
});

test("sanitises active and document-level raw HTML", async () => {
  const { application, page } = await launchEditor(unsafeHtmlFixturePath);
  try {
    const preview = page.getByTestId("preview");
    await expect(preview.getByRole("heading", { name: "Unsafe HTML" })).toBeVisible();
    await expect(preview.locator("script, style, link, meta, base, form")).toHaveCount(0);
    await expect(preview.locator("img")).not.toHaveAttribute("onerror");
    await expect(preview.locator("#inline-style")).toHaveAttribute("style", "color: red");
    await expect(preview.getByText("DOM clobbering guard")).not.toHaveAttribute("id");
    await expect(page.getByTestId("editor")).toBeVisible();
  } finally {
    await application.close();
  }
});
