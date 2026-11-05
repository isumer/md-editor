import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { readTextOrNull,
  clickMenuItem,
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

async function directoryEntries(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).sort();
}

test("Save As writes the chosen path and later Save uses it", {
  tag: "@AC-R5-10",
  annotation: { type: "AC-R5-10" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-save-as-"));
  const originalPath = path.join(temporaryDirectory, "original.md");
  const adoptedPath = path.join(temporaryDirectory, "adopted.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(originalPath, originalText, "utf8");
  const { application, page } = await launchEditor(originalPath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    const firstEdit = "\n\nsaved through Save As";
    await appendEditorText(page, firstEdit);
    await expect(page).toHaveTitle(/•/);
    await stubSaveDialog(application, adoptedPath);

    await clickMenuItem(application, "file-save-as");

    await expect.poll(() => readTextOrNull(adoptedPath))
      .toBe(originalText + firstEdit);
    await expect(page).toHaveTitle(/^adopted\.md —/);
    await expect(page).not.toHaveTitle(/•/);
    expect(await fs.readFile(originalPath, "utf8")).toBe(originalText);

    const secondEdit = "\n\nsaved after adopting the path";
    await appendEditorText(page, secondEdit);
    await clickMenuItem(application, "file-save");

    await expect.poll(() => readTextOrNull(adoptedPath))
      .toBe(originalText + firstEdit + secondEdit);
    expect(await fs.readFile(originalPath, "utf8")).toBe(originalText);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Save on an untitled document asks for a path and writes it", {
  tag: "@AC-R5-11",
  annotation: { type: "AC-R5-11" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-untitled-"));
  const chosenPath = path.join(temporaryDirectory, "chosen.md");
  const { application, page } = await launchEditor();

  try {
    await expect(page).toHaveTitle(/^Untitled —/);
    const text = "# Saved untitled document";
    await appendEditorText(page, text);
    await expect(page).toHaveTitle(/^• Untitled/);
    await stubSaveDialog(application, chosenPath);

    await clickMenuItem(application, "file-save");

    await expect.poll(() => dialogCallCount(application, "save")).toBe(1);
    await expect.poll(() => readTextOrNull(chosenPath)).toBe(text);
    await expect(page).toHaveTitle(/^chosen\.md —/);
    await expect(page).not.toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("cancelling Open leaves the dirty document and disk unchanged", {
  tag: "@AC-R5-12",
  annotation: { type: "AC-R5-12" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-cancel-open-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await appendEditorText(page, "\n\nunsaved open cancellation");
    await expect(page).toHaveTitle(/•/);
    const editor = page.getByTestId("editor").locator(".cm-content");
    const editorText = await editor.textContent();
    const title = await page.title();
    const entries = await directoryEntries(temporaryDirectory);
    await stubOpenDialog(application, null);

    await clickMenuItem(application, "file-open");

    await expect.poll(() => dialogCallCount(application, "open")).toBe(1);
    expect(await editor.textContent()).toBe(editorText);
    expect(await page.title()).toBe(title);
    expect(await fs.readFile(currentPath, "utf8")).toBe(originalText);
    expect(await directoryEntries(temporaryDirectory)).toEqual(entries);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("cancelling Save As leaves the dirty document and disk unchanged", {
  tag: "@AC-R5-12",
  annotation: { type: "AC-R5-12" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-cancel-save-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await appendEditorText(page, "\n\nunsaved Save As cancellation");
    await expect(page).toHaveTitle(/•/);
    const editor = page.getByTestId("editor").locator(".cm-content");
    const editorText = await editor.textContent();
    const title = await page.title();
    const entries = await directoryEntries(temporaryDirectory);
    await stubSaveDialog(application, null);

    await clickMenuItem(application, "file-save-as");

    await expect.poll(() => dialogCallCount(application, "save")).toBe(1);
    expect(await editor.textContent()).toBe(editorText);
    expect(await page.title()).toBe(title);
    expect(await fs.readFile(currentPath, "utf8")).toBe(originalText);
    expect(await directoryEntries(temporaryDirectory)).toEqual(entries);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("an edit made while Save is in flight stays dirty and off disk", {
  tag: "@AC-R5-14",
  annotation: { type: "AC-R5-14" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-save-race-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    const beforeSave = "\n\ncaptured by Save";
    const duringSave = " typed while saving";
    await appendEditorText(page, beforeSave);
    await expect(page).toHaveTitle(/•/);
    await page.evaluate((insertedText) => {
      document.documentElement.dataset["saveRaceEdit"] = "waiting";
      const removeListener = window.api.onMenuCommand((command) => {
        if (command !== "file-save") {
          return;
        }
        const content = document.querySelector<HTMLElement>(".cm-content");
        content?.focus();
        const inserted = document.execCommand("insertText", false, insertedText);
        document.documentElement.dataset["saveRaceEdit"] = inserted ? "inserted" : "failed";
        removeListener();
      });
    }, duringSave);

    await clickMenuItem(application, "file-save");

    await expect.poll(() => page.evaluate(() =>
      document.documentElement.dataset["saveRaceEdit"],
    )).toBe("inserted");
    await expect(page.getByTestId("editor")).toContainText(duringSave.trim());
    await expect.poll(() => readTextOrNull(currentPath))
      .toBe(originalText + beforeSave);
    await expect(page).toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Save writes exactly the edited document version", {
  tag: "@AC-R5-18",
  annotation: { type: "AC-R5-18" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-version-save-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  await fs.writeFile(currentPath, "# Before\n", "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Before");
    await editor.click();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+A`);
    const edited = "# Exact version\n\nSaved from the mirror.";
    await page.keyboard.type(edited);

    await clickMenuItem(application, "file-save");

    await expect.poll(() => readTextOrNull(currentPath)).toBe(edited);
    await expect(page).not.toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the Open menu item opens the file chosen by its dialog", {
  tag: "@AC-R5-15",
  annotation: { type: "AC-R5-15" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-menu-open-"));
  const openedPath = path.join(temporaryDirectory, "opened.md");
  await fs.writeFile(openedPath, "# Open menu ran\n", "utf8");
  const { application, page } = await launchEditor(fixturePath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await stubOpenDialog(application, openedPath);

    await clickMenuItem(application, "file-open");

    await expect.poll(() => dialogCallCount(application, "open")).toBe(1);
    await expect(page.getByTestId("editor")).toContainText("Open menu ran");
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the Save menu item writes the current document", {
  tag: "@AC-R5-15",
  annotation: { type: "AC-R5-15" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-menu-save-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(currentPath, originalText, "utf8");
  const { application, page } = await launchEditor(currentPath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    const edit = "\n\nSave menu ran";
    await appendEditorText(page, edit);

    await clickMenuItem(application, "file-save");

    await expect.poll(() => readTextOrNull(currentPath))
      .toBe(originalText + edit);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the Save As menu item writes the path chosen by its dialog", {
  tag: "@AC-R5-15",
  annotation: { type: "AC-R5-15" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-menu-save-as-"));
  const chosenPath = path.join(temporaryDirectory, "chosen.md");
  const originalText = await fs.readFile(fixturePath, "utf8");
  const { application, page } = await launchEditor(fixturePath);

  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await stubSaveDialog(application, chosenPath);

    await clickMenuItem(application, "file-save-as");

    await expect.poll(() => dialogCallCount(application, "save")).toBe(1);
    await expect.poll(() => readTextOrNull(chosenPath)).toBe(originalText);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("declining to discard changes for another file keeps Save writing the current one", {
  tag: "@AC-R5-09",
  annotation: { type: "AC-R5-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-declined-open-"));
  const currentPath = path.join(temporaryDirectory, "current.md");
  const otherPath = path.join(temporaryDirectory, "other.md");
  await fs.writeFile(currentPath, "# Current\n", "utf8");
  await fs.writeFile(otherPath, "# Other\n", "utf8");
  const { application, page } = await launchEditor(currentPath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Current");
    await appendEditorText(page, "\nkept edit");
    const discardDeclined = new Promise<string>((resolve) => {
      page.once("dialog", (dialog) => {
        void dialog.dismiss().then(() => { resolve(dialog.message()); });
      });
    });
    await stubOpenDialog(application, otherPath);

    await clickMenuItem(application, "file-open");
    expect(await discardDeclined).toBe("Discard unsaved changes?");
    await expect(page.getByTestId("editor")).toContainText("kept edit");
    await clickMenuItem(application, "file-save");

    await expect.poll(() => readTextOrNull(currentPath)).toBe("# Current\n\nkept edit");
    await expect(page).not.toHaveTitle(/•/);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

if (process.platform !== "win32") {
  test("saving a read-only file names it and explains the permission failure", {
    tag: "@AC-R5-16",
    annotation: { type: "AC-R5-16" },
  }, async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-read-only-"));
    const readOnlyPath = path.join(temporaryDirectory, "read-only.md");
    await fs.writeFile(readOnlyPath, "# Read only\n", { mode: 0o400 });
    const { application, page } = await launchEditor(readOnlyPath);
    try {
      await expect(page.getByTestId("editor")).toContainText("Read only");
      await appendEditorText(page, "\nblocked edit");

      await clickMenuItem(application, "file-save");

      await expect(page.getByTestId("status")).toContainText("read-only.md");
      await expect(page.getByTestId("status")).toContainText("permission");
      expect(await fs.readFile(readOnlyPath, "utf8")).toBe("# Read only\n");
    } finally {
      await application.close();
      await fs.chmod(readOnlyPath, 0o600);
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test("a save failure stays visible when the preview renders the next edit", {
    tag: "@AC-R5-16",
    annotation: { type: "AC-R5-16" },
  }, async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-kept-error-"));
    const readOnlyPath = path.join(temporaryDirectory, "read-only.md");
    await fs.writeFile(readOnlyPath, "# Read only\n", { mode: 0o400 });
    const { application, page } = await launchEditor(readOnlyPath);
    try {
      await expect(page.getByTestId("editor")).toContainText("Read only");
      await clickMenuItem(application, "file-save");
      await expect(page.getByTestId("status")).toContainText("read-only.md");
      const failure = await page.getByTestId("status").textContent();

      await appendEditorText(page, "\nrendered after the failure");
      await expect(page.getByTestId("preview")).toContainText("rendered after the failure");

      await expect(page.getByTestId("status")).toHaveText(failure as string);
    } finally {
      await application.close();
      await fs.chmod(readOnlyPath, 0o600);
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}
