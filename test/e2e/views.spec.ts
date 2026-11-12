import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  DOCUMENT_END,
  fixturePath,
  launchEditor,
  removeProfileDirectory,
  repositoryRoot,
} from "./helpers";

const largeFixturePath = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");

test("AC-R2-01: the View menu switches all pane modes", async () => {
  const { application, page } = await launchEditor(largeFixturePath);
  try {
    const editor = page.getByTestId("editor");
    const preview = page.getByTestId("preview");
    await editor.locator(".cm-content").click();
    await page.keyboard.press(DOCUMENT_END);
    await preview.evaluate((element) => { element.scrollTop = 120; });
    const text = await editor.locator(".cm-content").textContent();
    const activeLine = await editor.locator(".cm-activeLine").textContent();
    const editorScroll = await editor.locator(".cm-scroller")
      .evaluate((element) => element.scrollTop);
    const previewScroll = await preview.evaluate((element) => element.scrollTop);

    await clickMenuItem(application, "view-editor");
    await expect(editor).toBeVisible();
    await expect(preview).toBeHidden();
    await clickMenuItem(application, "view-preview");
    await expect(editor).toBeHidden();
    await expect(preview).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+1" : "Control+1");

    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(editor.locator(".cm-content")).toHaveText(text ?? "");
    await expect(editor.locator(".cm-activeLine")).toHaveText(activeLine ?? "");
    expect(await editor.locator(".cm-scroller").evaluate((element) => element.scrollTop))
      .toBe(editorScroll);
    expect(await preview.evaluate((element) => element.scrollTop)).toBe(previewScroll);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-02: the divider persists and resets", async () => {
  const first = await launchEditor(fixturePath);
  let restarted: Awaited<ReturnType<typeof launchEditor>> | null = null;
  try {
    const workspace = first.page.locator("#workspace");
    const divider = first.page.getByTestId("divider");
    const bounds = await workspace.boundingBox();
    if (bounds === null) throw new Error("Workspace has no bounds");
    await divider.hover();
    await first.page.mouse.down();
    await first.page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + 100);
    await first.page.mouse.up();

    await expect.poll(() => workspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("30%");
    await first.application.close();
    restarted = await launchEditor(fixturePath, first.userDataDir);
    const restoredWorkspace = restarted.page.locator("#workspace");
    const restoredDivider = restarted.page.getByTestId("divider");
    await expect.poll(() => restoredWorkspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("30%");
    await restoredDivider.dblclick();
    await expect.poll(() => restoredWorkspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("50%");
  } finally {
    if (restarted === null) {
      await first.application.close().catch(() => undefined);
      await removeProfileDirectory(first.userDataDir);
    } else {
      await closeEditor(restarted.application, restarted.page);
    }
  }
});

test("AC-R2-03: Full Screen uses the operating system state", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false)).toBe(true);
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? true)).toBe(false);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-07: a wide preview keeps a 900 pixel text column", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await clickMenuItem(application, "view-preview");
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1_400, 800));

    await expect.poll(() => page.locator(".preview-document").evaluate((element) =>
      Math.round(element.getBoundingClientRect().width))).toBe(900);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-08: view modes add no toolbar row", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById("view-editor")))).toBe(true);
    await expect(page.locator("body > #tabs + #workspace")).toHaveCount(1);
    await expect(page.locator("[role=toolbar]")).toHaveCount(0);
  } finally {
    await closeEditor(application, page);
  }
});
