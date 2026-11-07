import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  fixturePath,
  launchEditor,
  stubOpenDialog,
} from "./helpers";

async function expectFailedOpenToPreserveDocument(
  failedPath: string,
  expectedStatus: string,
): Promise<void> {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    const editorText = await editor.textContent();
    const title = await page.title();
    await stubOpenDialog(application, failedPath);

    await clickMenuItem(application, "file-open");

    await expect(page.getByTestId("status")).toContainText(expectedStatus);
    expect(await editor.textContent()).toBe(editorText);
    expect(await page.title()).toBe(title);
  } finally {
    await closeEditor(application, page);
  }
}

test("opening a missing file names the failure and keeps the current document", {
  tag: ["@AC-R5-13", "@AC-R5-16"],
  annotation: [{ type: "AC-R5-13" }, { type: "AC-R5-16" }],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-missing-open-"));
  const missingPath = path.join(temporaryDirectory, "missing.md");
  try {
    await expectFailedOpenToPreserveDocument(
      missingPath,
      "Could not access “missing.md”: it was not found.",
    );
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("opening a directory names the failure and keeps the current document", {
  tag: ["@AC-R5-13", "@AC-R5-16"],
  annotation: [{ type: "AC-R5-13" }, { type: "AC-R5-16" }],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-directory-open-"));
  try {
    await expectFailedOpenToPreserveDocument(
      temporaryDirectory,
      `Could not open “${path.basename(temporaryDirectory)}”: it is a folder.`,
    );
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

if (process.platform !== "win32") {
  test("opening a file without read permission names the failure and keeps the document", {
    tag: ["@AC-R5-13", "@AC-R5-16"],
    annotation: [{ type: "AC-R5-13" }, { type: "AC-R5-16" }],
  }, async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-unreadable-"));
    const unreadablePath = path.join(temporaryDirectory, "unreadable.md");
    await fs.writeFile(unreadablePath, "# Must not open\n", { mode: 0o600 });
    await fs.chmod(unreadablePath, 0o000);
    try {
      await expectFailedOpenToPreserveDocument(
        unreadablePath,
        "Could not access “unreadable.md”: permission was denied.",
      );
    } finally {
      await fs.chmod(unreadablePath, 0o600);
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}
