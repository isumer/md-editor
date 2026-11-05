import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { readTextOrNull,
  fixturePath,
  launchEditor,
  launchSecondInstance,
  linkFixturePath,
  unsafeHtmlFixturePath,
} from "./helpers";

test("opens an argv file and renders its heading", {
  tag: "@AC-R5-01",
  annotation: { type: "AC-R5-01" },
}, async () => {
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

test("shows the window after it is ready", {
  tag: "@AC-PERF-01",
  annotation: { type: "AC-PERF-01" },
}, async () => {
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

test("shows the editor to the left of the preview", {
  tag: "@AC-R1-01",
  annotation: { type: "AC-R1-01" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor");
    const preview = page.getByTestId("preview");
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();

    const editorBox = await editor.boundingBox();
    const previewBox = await preview.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(previewBox!.x);
  } finally {
    await application.close();
  }
});

test("exposes stable File menu items with their accelerators", {
  tag: "@AC-R5-08",
  annotation: { type: "AC-R5-08" },
}, async () => {
  const { application } = await launchEditor(fixturePath);
  try {
    await expect.poll(() => application.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return ["file-open", "file-save", "file-save-as"].map((id) => {
        const item = menu?.getMenuItemById(id);
        return { id: item?.id, accelerator: item?.accelerator };
      });
    }), { timeout: 5_000 }).toEqual([
      { id: "file-open", accelerator: "CmdOrCtrl+O" },
      { id: "file-save", accelerator: "CmdOrCtrl+S" },
      { id: "file-save-as", accelerator: "CmdOrCtrl+Shift+S" },
    ]);
  } finally {
    await application.close();
  }
});

test("typing quickly shows the final text in the preview", {
  tag: ["@AC-R1-02", "@AC-R1-07"],
  annotation: [{ type: "AC-R1-02" }, { type: "AC-R1-07" }],
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n\n## Added final preview");

    await expect(page.getByTestId("preview").locator("h2")).toHaveText("Added final preview", {
      timeout: 1_000,
    });
  } finally {
    await application.close();
  }
});

test("saves edits atomically and clears the dirty marker", {
  tag: "@AC-R5-02",
  annotation: { type: "AC-R5-02" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-e2e-"));
  const copiedFile = path.join(temporaryDirectory, "sample.md");
  await fs.copyFile(fixturePath, copiedFile);
  const { application, page } = await launchEditor(copiedFile);

  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    // The argv file arrives after the io-worker port; typing earlier edits an untitled buffer.
    await expect(editor).toContainText("Sample document");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\n\nsaved text");
    await expect(page).toHaveTitle(/•/);

    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById("file-save")!.click(),
    );

    await expect.poll(() => readTextOrNull(copiedFile)).toContain("saved text");
    await expect(page).not.toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("a second instance opens its file in the existing window", {
  tag: "@AC-R9-03",
  annotation: { type: "AC-R9-03" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-single-"));
  const secondFile = path.join(temporaryDirectory, "second.md");
  await fs.writeFile(secondFile, "# Opened by the second instance\n", "utf8");
  const { application, page } = await launchEditor(fixturePath);

  try {
    await launchSecondInstance(application, secondFile);

    await expect(page.getByTestId("editor")).toContainText("Opened by the second instance");
    await expect.poll(() => application.windows().length).toBe(1);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("an open request asks before discarding dirty changes", {
  tag: "@AC-R5-09",
  annotation: { type: "AC-R5-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-dirty-"));
  const secondFile = path.join(temporaryDirectory, "second.md");
  await fs.writeFile(secondFile, "# Replacement document\n", "utf8");
  const { application, page } = await launchEditor(fixturePath);

  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    await editor.click();
    await page.keyboard.type("dirty change");
    const dialogHandled = new Promise<void>((resolve, reject) => {
      page.once("dialog", async (dialog) => {
        try {
          expect(dialog.message()).toBe("Discard unsaved changes?");
          await dialog.dismiss();
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    await launchSecondInstance(application, secondFile);
    await dialogHandled;

    await expect(editor).toContainText("dirty change");
    await expect(page).toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("opens external preview links outside the editor", {
  tag: "@AC-SEC-01",
  annotation: { type: "AC-SEC-01" },
}, async () => {
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

test("blocks javascript preview links without opening or navigating", {
  tag: "@AC-SEC-02",
  annotation: { type: "AC-SEC-02" },
}, async () => {
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

test("scrolls preview anchors without navigating the window", {
  tag: "@AC-SEC-03",
  annotation: { type: "AC-SEC-03" },
}, async () => {
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

test("sanitises active and document-level raw HTML", {
  tag: ["@AC-SEC-04", "@AC-SEC-05"],
  annotation: [{ type: "AC-SEC-04" }, { type: "AC-SEC-05" }],
}, async () => {
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
