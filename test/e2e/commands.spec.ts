import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { readTextOrNull,
  dialogCallCount,
  fixturePath,
  launchEditor,
  stubOpenDialog,
  stubSaveDialog,
} from "./helpers";

const PRIMARY_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";
const DOCUMENT_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

async function appendEditorText(page: Page, text: string): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press(DOCUMENT_END);
  await page.keyboard.type(text);
}

async function menuItemIds(
  application: Awaited<ReturnType<typeof launchEditor>>["application"],
): Promise<Array<string | null>> {
  return application.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    return ["file-open", "file-save", "file-save-as"].map((id) =>
      menu?.getMenuItemById(id)?.id ?? null);
  });
}

test("undo and redo chords revert and restore typed text with preview and dirty state", {
  tag: "@AC-R1-08",
  annotation: { type: "AC-R1-08" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    const preview = page.getByTestId("preview");
    await expect(editor).toContainText("Sample document");
    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    const typed = "keyboard undo text";
    await page.keyboard.type(typed);
    await expect(preview).toContainText(typed);
    await expect(page).toHaveTitle(/•/);

    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);

    await expect(editor).not.toContainText(typed);
    await expect(preview).not.toContainText(typed);
    await expect(page).not.toHaveTitle(/•/);

    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+z`);

    await expect(editor).toContainText(typed);
    await expect(preview).toContainText(typed);
    await expect(page).toHaveTitle(/•/);

    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(editor).not.toContainText(typed);
    if (process.platform !== "darwin") {
      await page.keyboard.press(`${PRIMARY_MODIFIER}+y`);
      await expect(editor).toContainText(typed);
      await expect(page).toHaveTitle(/•/);
    }
  } finally {
    await application.close();
  }
});

test("Open, Save and Save As chords run their commands and display non-native accelerators", {
  tag: "@AC-R5-20",
  annotation: { type: "AC-R5-20" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-keys-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const adoptedPath = path.join(temporaryDirectory, "adopted.md");
  const otherPath = path.join(temporaryDirectory, "other.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  await fs.writeFile(otherPath, "# Opened by the chord\n", "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");

    await expect.poll(() => application.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return ["file-open", "file-save", "file-save-as"].map((id) => {
        const item = menu?.getMenuItemById(id);
        return {
          id: item?.id,
          label: item?.label,
          accelerator: item?.accelerator,
          registerAccelerator: item?.registerAccelerator,
        };
      });
    }), { timeout: 5_000 }).toEqual([
      {
        id: "file-open",
        label: "Open",
        accelerator: "CmdOrCtrl+O",
        registerAccelerator: false,
      },
      {
        id: "file-save",
        label: "Save",
        accelerator: "CmdOrCtrl+S",
        registerAccelerator: false,
      },
      {
        id: "file-save-as",
        label: "Save As",
        accelerator: "CmdOrCtrl+Shift+S",
        registerAccelerator: false,
      },
    ]);

    const edit = "\n\nsaved from the Save chord";
    await appendEditorText(page, edit);
    await page.keyboard.press(`${PRIMARY_MODIFIER}+s`);
    await expect.poll(() => readTextOrNull(currentPath)).toBe(originalText + edit);
    await expect(page).not.toHaveTitle(/•/);

    await stubSaveDialog(application, adoptedPath);
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+s`);
    await expect.poll(() => dialogCallCount(application, "save")).toBe(1);
    await expect.poll(() => readTextOrNull(adoptedPath)).toBe(originalText + edit);
    await expect(page).toHaveTitle(/^adopted\.md —/);

    await stubOpenDialog(application, otherPath);
    await page.keyboard.press(`${PRIMARY_MODIFIER}+o`);
    await expect.poll(() => dialogCallCount(application, "open")).toBe(1);
    await expect(editor).toContainText("Opened by the chord");
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the renderer contributes the File action items and patches their state in place", {
  tag: "@AC-R5-21",
  annotation: { type: "AC-R5-21" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await expect.poll(() => menuItemIds(application), { timeout: 5_000 }).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
    ]);
    const contributed = await application.evaluate(({ Menu }) => {
      const open = Menu.getApplicationMenu()?.getMenuItemById("file-open");
      return {
        label: open?.label,
        accelerator: open?.accelerator,
        registerAccelerator: open?.registerAccelerator,
      };
    });
    expect(contributed).toEqual({
      label: "Open",
      accelerator: "CmdOrCtrl+O",
      registerAccelerator: false,
    });

    // A contribution with no items leaves only the platform-owned skeleton actions.
    await page.evaluate(() => window.api.contributeMenu({ fileMenuTitle: "File", items: [] }));
    await expect.poll(() => menuItemIds(application), { timeout: 5_000 }).toEqual([
      null,
      null,
      null,
    ]);
    const skeletonRoles = await application.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const roles = (items: Electron.MenuItem[]) =>
        items.map((item) => item.role ?? item.id);
      return {
        applicationMenu: roles(menu?.items[0]?.submenu?.items ?? []),
        fileMenu: roles(menu?.items.find((item) => item.label === "File")?.submenu?.items ?? []),
      };
    });
    if (process.platform === "darwin") {
      expect(skeletonRoles.applicationMenu).toContain("quit");
      expect(skeletonRoles.fileMenu).toEqual([]);
    } else {
      expect(skeletonRoles.fileMenu).toEqual(["quit"]);
    }

    // The renderer's next contribution restores the items and carries their state.
    await page.evaluate(() => window.api.contributeMenu({
      fileMenuTitle: "File",
      items: [
        { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O", enabled: false },
        { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S", enabled: true },
        { id: "file-save-as", title: "Save As", accelerator: "CmdOrCtrl+Shift+S", enabled: true },
      ],
    }));
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("file-open")?.enabled)).toBe(false);
    await expect.poll(() => menuItemIds(application)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
    ]);
  } finally {
    await application.close();
  }
});
