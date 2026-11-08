import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { closeEditor, launchEditor } from "./helpers";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function createDocumentFolder(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-doc-asset-"));
  const documents = path.join(root, "documents");
  await fs.mkdir(path.join(documents, "images"), { recursive: true });
  await fs.writeFile(path.join(documents, "images", "pic.png"), ONE_PIXEL_PNG);
  await fs.writeFile(path.join(root, "outside.png"), ONE_PIXEL_PNG);
  await fs.writeFile(
    path.join(documents, "note.md"),
    "# Assets\n\n![inside](images/pic.png)\n\n![outside](../outside.png)\n",
    "utf8",
  );
  return documents;
}

async function imageWidth(page: Page, alt: string): Promise<number> {
  return page.getByTestId("preview").locator(`img[alt="${alt}"]`)
    .evaluate((image) => (image as HTMLImageElement).naturalWidth);
}

test("relative preview images load through the document asset protocol", {
  tag: "@AC-SEC-16",
  annotation: { type: "AC-SEC-16" },
}, async () => {
  const documents = await createDocumentFolder();
  const { application, page } = await launchEditor(path.join(documents, "note.md"));
  try {
    const inside = page.getByTestId("preview").locator('img[alt="inside"]');
    await expect(inside).toHaveAttribute("src", /^doc-asset:\/\/\d+\//);
    await expect.poll(() => imageWidth(page, "inside")).toBeGreaterThan(0);

    const outside = page.getByTestId("preview").locator('img[alt="outside"]');
    await expect(outside).toHaveAttribute("src", /\.\.\/outside\.png$/);
    await expect.poll(() => imageWidth(page, "outside")).toBe(0);
    const outsideSource = await outside.getAttribute("src");
    expect(outsideSource).not.toBeNull();
    if (outsideSource === null) {
      throw new Error("the traversing image has no source");
    }
    const response = await application.evaluate(async ({ net }, url) => {
      const result = await net.fetch(url);
      return { ok: result.ok, status: result.status, body: await result.text() };
    }, outsideSource);
    expect(response).toEqual({ ok: false, status: 404, body: "" });
  } finally {
    await closeEditor(application, page);
    await fs.rm(path.dirname(documents), { recursive: true, force: true });
  }
});

test("the document asset protocol enforces the window and grant", {
  tag: "@AC-SEC-17",
  annotation: { type: "AC-SEC-17" },
}, async () => {
  const documents = await createDocumentFolder();
  const { application, page } = await launchEditor(path.join(documents, "note.md"));
  try {
    const inside = page.getByTestId("preview").locator('img[alt="inside"]');
    await expect(inside).toHaveAttribute("src", /^doc-asset:\/\/\d+\//);
    const source = await inside.getAttribute("src");
    if (source === null) {
      throw new Error("the relative image has no source");
    }
    const parsed = /^doc-asset:\/\/(\d+)\/([^/]+)\//.exec(source);
    if (!parsed) {
      throw new Error(`unexpected asset URL: ${source}`);
    }
    const windowId = Number(parsed[1]);
    const grant = decodeURIComponent(parsed[2] ?? "");

    const fetched = await application.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url);
      const body = Buffer.from(await response.arrayBuffer());
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: body.toString("base64"),
      };
    }, source);
    expect(fetched).toEqual({
      ok: true,
      status: 200,
      contentType: "image/png",
      body: ONE_PIXEL_PNG.toString("base64"),
    });

    const otherWindow = await application.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url);
      return { ok: response.ok, status: response.status, body: await response.text() };
    }, `doc-asset://${windowId + 1}/${encodeURIComponent(grant)}/images/pic.png`);
    expect(otherWindow).toEqual({ ok: false, status: 404, body: "" });

    await page.evaluate(async (handle) => {
      await window.api.releaseDocument({ grant: handle });
    }, grant);
    const revoked = await application.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url);
      return { ok: response.ok, status: response.status, body: await response.text() };
    }, source);
    expect(revoked).toEqual({ ok: false, status: 404, body: "" });
  } finally {
    await closeEditor(application, page);
    await fs.rm(path.dirname(documents), { recursive: true, force: true });
  }
});
