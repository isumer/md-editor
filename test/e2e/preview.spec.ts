import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  fixturePath,
  launchEditor,
  stubOpenDialog,
} from "./helpers";

test.describe.configure({ timeout: 60_000 });

async function temporaryDirectory(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("a failed render keeps the last good preview and a later success replaces it", {
  tag: "@AC-R1-06",
  annotation: { type: "AC-R1-06" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await page.addInitScript(() => {
      const probe: { fail: boolean } = { fail: false };
      const scope = window as unknown as {
        __previewProbe?: { fail: boolean };
        __mdEditorRenderWorkerFactory?: (url: URL) => unknown;
      };
      scope.__previewProbe = probe;
      scope.__mdEditorRenderWorkerFactory = (url: URL) => {
        const worker = new Worker(url, { type: "module" });
        const port = {
          onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
          onerror: null as ((event: ErrorEvent) => void) | null,
          postMessage(message: { op?: string; id?: number } & Record<string, unknown>) {
            if (message.op === "render" && probe.fail) {
              setTimeout(() => {
                port.onmessage?.({
                  data: {
                    id: message.id,
                    docId: message["docId"],
                    epoch: message["epoch"],
                    version: message["version"],
                    ok: false,
                    message: "injected render failure",
                  },
                } as unknown as MessageEvent<unknown>);
              }, 0);
              return;
            }
            worker.postMessage(message);
          },
        };
        worker.onmessage = (event) => port.onmessage?.(event);
        worker.onerror = (event) => port.onerror?.(event);
        return port;
      };
    });
    await page.reload();
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();

    await stubOpenDialog(application, fixturePath);
    await clickMenuItem(application, "file-open");
    const preview = page.getByTestId("preview");
    const status = page.getByTestId("status");
    await expect(preview.locator("h1")).toHaveText("Sample document", { timeout: 5_000 });
    const lastGood = await preview.textContent();

    await page.evaluate(() => {
      (window as unknown as { __previewProbe?: { fail: boolean } })
        .__previewProbe!.fail = true;
    });
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" failed edit");

    await expect(status).toHaveText("injected render failure", { timeout: 5_000 });
    expect(await preview.textContent()).toBe(lastGood);

    await page.evaluate(() => {
      (window as unknown as { __previewProbe?: { fail: boolean } })
        .__previewProbe!.fail = false;
    });
    await page.keyboard.type(" recovered edit");

    await expect(preview.getByText("failed edit recovered edit")).toBeVisible({
      timeout: 5_000,
    });
    await expect(status).toHaveText("");
  } finally {
    await application.close();
  }
});

test("typing in paragraph 3 keeps every other preview paragraph's DOM node", {
  tag: "@AC-R1-09",
  annotation: { type: "AC-R1-09" },
}, async () => {
  const directory = await temporaryDirectory("mdeditor-identity-");
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
      scope.__previewNodes = [...document.querySelectorAll("#preview > .preview-block")];
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
      return [...document.querySelectorAll("#preview > .preview-block")]
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
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("editing one block does not re-request another block's image", {
  tag: "@AC-R1-11",
  annotation: { type: "AC-R1-11" },
}, async () => {
  const directory = await temporaryDirectory("mdeditor-asset-");
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
  const { application, page } = await launchEditor(documentPath);
  const imageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("probe.png")) {
      imageRequests.push(request.url());
    }
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
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
