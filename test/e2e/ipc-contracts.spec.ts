import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  fixturePath,
  launchEditor,
  stubOpenDialog,
} from "./helpers";

type InvalidSaveKind =
  | "missing-text"
  | "non-string-text"
  | "object-grant"
  | "own-proto"
  | "oversized-text";

const invalidSaveCases: ReadonlyArray<{
  kind: InvalidSaveKind;
  name: string;
}> = [
  { kind: "missing-text", name: "a request without text" },
  { kind: "non-string-text", name: "a request whose text is not a string" },
  { kind: "object-grant", name: "a request whose grant is an object" },
  { kind: "own-proto", name: "a request with an own __proto__ key" },
  { kind: "oversized-text", name: "a request with 257 MiB of text" },
];

async function sendInvalidSave(
  page: Page,
  kind: InvalidSaveKind,
): Promise<unknown> {
  return page.evaluate(async (invalidKind) => {
    let request: unknown;
    switch (invalidKind) {
      case "missing-text":
        request = { grant: null };
        break;
      case "non-string-text":
        request = { grant: null, text: 42 };
        break;
      case "object-grant":
        request = { grant: {}, text: "must not be written" };
        break;
      case "own-proto": {
        const hostile = { grant: null, text: "must not be written" };
        Object.defineProperty(hostile, "__proto__", {
          enumerable: true,
          value: { polluted: true },
        });
        request = hostile;
        break;
      }
      case "oversized-text":
        request = { grant: null, text: "x".repeat(257 * 1024 * 1024) };
        break;
    }
    const writeDocument = window.api.writeDocument as unknown as (
      value: unknown,
    ) => Promise<unknown>;
    return writeDocument(request);
  }, kind);
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
    const { application, page } = await launchEditor(fixturePath);

    try {
      await expect(page.getByTestId("editor")).toContainText("Sample document");
      const result = await sendInvalidSave(page, invalidCase.kind);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          messageKey: "request.invalid",
          retryable: false,
        },
      });
      expect(await fs.readdir(temporaryDirectory)).toEqual([]);
      await expectRendererResponsive(page, invalidCase.kind);
    } finally {
      await application.close();
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
}

const rejectedExternalUrls: ReadonlyArray<{ name: string; value: unknown; code: string }> = [
  { name: "a file URL", value: "file:///etc/passwd", code: "UNSUPPORTED_SCHEME" },
  { name: "a javascript URL", value: "javascript:alert(1)", code: "UNSUPPORTED_SCHEME" },
  { name: "a data URL", value: "data:text/html,x", code: "UNSUPPORTED_SCHEME" },
  { name: "an unparsable URL", value: "not a url", code: "BAD_REQUEST" },
  { name: "a non-string URL", value: 42, code: "BAD_REQUEST" },
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
        const openExternal = window.api.openExternal as unknown as (
          url: unknown,
        ) => Promise<unknown>;
        return openExternal(value);
      }, rejectedUrl.value);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: rejectedUrl.code,
          retryable: false,
        },
      });
      await expect.poll(() => application.evaluate(() =>
        (globalThis as typeof globalThis & { externalUrls?: string[] }).externalUrls,
      )).toEqual([]);
    } finally {
      await application.close();
    }
  });
}

test("the preload exposes only the fixed named API", {
  tag: "@AC-SEC-11",
  annotation: { type: "AC-SEC-11" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");

    const shape = await page.evaluate(() => ({
      keys: Object.keys(window.api).sort(),
      legacyGlobal: "mdApi" in window,
    }));

    expect(shape).toEqual({
      keys: [
        "chooseSaveTarget",
        "onMenuCommand",
        "onOpenRequest",
        "openExternal",
        "openFile",
        "readDocument",
        "readyForOpenRequests",
        "releaseDocument",
        "writeDocument",
      ],
      legacyGlobal: false,
    });
  } finally {
    await application.close();
  }
});

test("the file-save contract rejects raw and forged grants", {
  tag: "@AC-SEC-09",
  annotation: { type: "AC-SEC-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-raw-grant-"));
  const targetPath = path.join(temporaryDirectory, "must-not-exist.md");
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");

    for (const grant of [targetPath, "forged-grant"]) {
      const result = await page.evaluate(async ({ candidate, text }) =>
        window.api.writeDocument({ grant: candidate, text }), {
        candidate: grant,
        text: "must not be written",
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "GRANT_INVALID" },
      });
    }
    expect(await fs.readdir(temporaryDirectory)).toEqual([]);
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the file-save contract rejects a released grant", {
  tag: "@AC-SEC-09",
  annotation: { type: "AC-SEC-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-revoked-grant-"));
  const firstPath = path.join(temporaryDirectory, "first.md");
  await fs.writeFile(firstPath, "first", "utf8");
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");
    await stubOpenDialog(application, firstPath);
    const first = await page.evaluate(() => window.api.openFile());
    const firstGrant = first.ok ? first.value?.grant : null;
    if (!firstGrant) {
      throw new Error("the first open did not return a grant");
    }
    await page.evaluate(async (grant) => window.api.releaseDocument({ grant }), firstGrant);

    const result = await page.evaluate(async (grant) =>
      window.api.writeDocument({ grant, text: "must not be written" }), firstGrant);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "GRANT_INVALID" },
    });
    expect(await fs.readFile(firstPath, "utf8")).toBe("first");
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
