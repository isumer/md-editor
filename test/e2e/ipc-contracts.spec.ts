import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { fixturePath, launchEditor } from "./helpers";

type InvalidSaveKind =
  | "missing-text"
  | "non-string-text"
  | "object-path";

const invalidSaveCases: ReadonlyArray<{
  kind: InvalidSaveKind;
  name: string;
}> = [
  { kind: "missing-text", name: "a request without text" },
  { kind: "non-string-text", name: "a request whose text is not a string" },
  { kind: "object-path", name: "a request whose path is an object" },
];

async function sendInvalidSave(
  page: Page,
  kind: InvalidSaveKind,
  targetPath: string,
): Promise<unknown> {
  return page.evaluate(async ({ invalidKind, savePath }) => {
    let request: unknown;
    switch (invalidKind) {
      case "missing-text":
        request = { path: savePath };
        break;
      case "non-string-text":
        request = { path: savePath, text: 42 };
        break;
      case "object-path":
        request = { path: { value: savePath }, text: "must not be written" };
        break;
    }
    const saveFile = window.mdApi.saveFile as unknown as (
      value: unknown,
    ) => Promise<unknown>;
    return saveFile(request);
  }, { invalidKind: kind, savePath: targetPath });
}

async function expectRendererResponsive(page: Page, marker: string): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(`\n\n## Responsive ${marker}`);
  await expect(page.getByTestId("preview").getByRole("heading", {
    name: `Responsive ${marker}`,
  })).toBeVisible();
}

for (const invalidCase of invalidSaveCases) {
  test(`the file-save contract rejects ${invalidCase.name}`, {
    tag: "@AC-SEC-07",
    annotation: { type: "AC-SEC-07" },
  }, async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-bad-save-"));
    const targetPath = path.join(temporaryDirectory, "must-not-exist.md");
    const { application, page } = await launchEditor(fixturePath);

    try {
      await expect(page.getByTestId("editor")).toContainText("Sample document");
      const result = await sendInvalidSave(page, invalidCase.kind, targetPath);

      expect(result).toEqual({
        ok: false,
        code: "BAD_REQUEST",
        message: expect.any(String),
      });
      expect(await fs.readdir(temporaryDirectory)).toEqual([]);
      await expectRendererResponsive(page, invalidCase.kind);
    } finally {
      await application.close();
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}

const rejectedExternalUrls: ReadonlyArray<{ name: string; value: unknown }> = [
  { name: "a file URL", value: "file:///etc/passwd" },
  { name: "a javascript URL", value: "javascript:alert(1)" },
  { name: "a data URL", value: "data:text/html,x" },
  { name: "an unparsable URL", value: "not a url" },
  { name: "a non-string URL", value: 42 },
];

for (const rejectedUrl of rejectedExternalUrls) {
  test(`the open-external contract rejects ${rejectedUrl.name}`, {
    tag: "@AC-SEC-08",
    annotation: { type: "AC-SEC-08" },
  }, async () => {
    const { application, page } = await launchEditor(fixturePath);
    try {
      await expect(page.getByTestId("editor")).toContainText("Sample document");
      await application.evaluate(({ shell }) => {
        const probe = globalThis as typeof globalThis & { externalUrls?: string[] };
        probe.externalUrls = [];
        shell.openExternal = async (url) => {
          probe.externalUrls?.push(url);
        };
      });

      const result = await page.evaluate(async (value) => {
        const openExternal = window.mdApi.openExternal as unknown as (
          url: unknown,
        ) => Promise<unknown>;
        return openExternal(value);
      }, rejectedUrl.value);

      expect(result).toEqual({
        ok: false,
        code: "BAD_REQUEST",
        message: expect.any(String),
      });
      await expect.poll(() => application.evaluate(() =>
        (globalThis as typeof globalThis & { externalUrls?: string[] }).externalUrls,
      )).toEqual([]);
    } finally {
      await application.close();
    }
  });
}
