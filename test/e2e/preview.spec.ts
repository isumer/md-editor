import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { closeEditor, launchEditor } from "./helpers";

test.describe.configure({ timeout: 60_000 });

async function temporaryDirectory(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("typing in paragraph 3 keeps every other preview paragraph's DOM node", {
  tag: "@AC-R1-09",
  annotation: { type: "AC-R1-09" },
}, async () => {
  const directory = await temporaryDirectory("solidmd-identity-");
  const documentPath = path.join(directory, "paragraphs.md");
  await fs.writeFile(
    documentPath,
    "# Identity document\n\nParagraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.\n",
    "utf8",
  );
  const { application, page } = await launchEditor(documentPath);
  try {
    const preview = page.getByTestId("preview");
    await expect(preview.getByText("Paragraph three.")).toBeVisible({ timeout: 5_000 });
    await page.evaluate(() => {
      const scope = window as unknown as { __previewNodes?: Element[] };
      scope.__previewNodes = [...document.querySelectorAll("#preview .preview-block")];
    });
    const before = await preview.locator(".preview-block").allTextContents();

    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.locator(".cm-line", { hasText: "Paragraph three." }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");

    await expect(preview.getByText("Paragraph three. edited")).toBeVisible({
      timeout: 5_000,
    });
    const identities = await page.evaluate(() => {
      const scope = window as unknown as { __previewNodes?: Element[] };
      const nodes = scope.__previewNodes ?? [];
      return [...document.querySelectorAll("#preview .preview-block")]
        .map((element, index) => element === nodes[index]);
    });
    const after = await preview.locator(".preview-block").allTextContents();

    expect(identities.filter((_same, index) => index !== 3))
      .toEqual([true, true, true, true]);
    expect(after[3]).toContain("edited");
    expect(after.filter((_text, index) => index !== 3)).toEqual(
      before.filter((_text, index) => index !== 3),
    );
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("editing one block does not re-request another block's image", {
  tag: "@AC-R1-11",
  annotation: { type: "AC-R1-11" },
}, async () => {
  const directory = await temporaryDirectory("solidmd-asset-");
  const documentPath = path.join(directory, "assets.md");
  const imagePath = path.join(directory, "probe.png");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await fs.writeFile(imagePath, png);
  await fs.writeFile(
    documentPath,
    "![probe](probe.png)\n\nText paragraph without an image.\n",
    "utf8",
  );
  const imageRequests: string[] = [];
  const { application, page } = await launchEditor(documentPath, {
    onPage: ({ page: readyPage }) => {
      readyPage.on("request", (request) => {
        if (request.url().includes("probe.png")) {
          imageRequests.push(request.url());
        }
      });
    },
  });
  try {
    const preview = page.getByTestId("preview");
    const image = preview.locator("img");
    await expect(image).toHaveAttribute("src", /^doc-asset:\/\//, { timeout: 5_000 });
    await expect.poll(() => imageRequests.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const requestsBefore = imageRequests.length;

    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.locator(".cm-line", { hasText: "Text paragraph without an image." }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");
    await expect(preview.getByText(/Text paragraph without an image\. edited/)).toBeVisible({
      timeout: 5_000,
    });

    expect(imageRequests.length).toBe(requestsBefore);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
