import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  fixturePath,
  launchEditor,
  readTextOrNull,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

const binaryFixturePath = path.join(
  repositoryRoot,
  "test/fixtures/binary/nul-byte.bin",
);

test("opening a binary file names the failure and keeps the current document", {
  tag: "@AC-R12-01",
  annotation: { type: "AC-R12-01" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText("Sample document");
    const editorText = await editor.textContent();
    const documentText = await readTextOrNull(fixturePath);
    expect(documentText).not.toBeNull();
    await stubOpenDialog(application, binaryFixturePath);

    await clickMenuItem(application, "file-open");

    await expect(page.getByTestId("status")).toHaveText(
      "Could not open “nul-byte.bin”: it is a binary file.",
    );
    expect(await editor.textContent()).toBe(editorText);
    expect(await readTextOrNull(fixturePath)).toBe(documentText);
  } finally {
    await application.close();
  }
});
