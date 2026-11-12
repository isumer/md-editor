import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import {
  closeEditor,
  dialogCallCount,
  fixturePath,
  launchEditor,
  stubOpenDialog,
  stubSaveDialog,
} from "./helpers";

type InvalidSaveKind =
  | "missing-version"
  | "fractional-version"
  | "object-grant"
  | "own-proto"
  | "oversized-attach";

const invalidSaveCases: ReadonlyArray<{
  kind: InvalidSaveKind;
  name: string;
}> = [
  { kind: "missing-version", name: "a request without a version" },
  { kind: "fractional-version", name: "a request whose version is fractional" },
  { kind: "object-grant", name: "a request whose grant is an object" },
  { kind: "own-proto", name: "a request with an own __proto__ key" },
  { kind: "oversized-attach", name: "an attach request with 257 MiB of text" },
];

async function openGrant(
  application: ElectronApplication,
  page: Page,
  filePath: string,
): Promise<string> {
  await stubOpenDialog(application, filePath);
  const opened = await page.evaluate(() => window.api.openFile());
  const grant = opened.ok ? opened.value?.grant : null;
  if (!grant) {
    throw new Error("the open did not return a grant");
  }
  return grant;
}

// Port cases carry a live grant so field validation, not grant validation, refuses them.
async function sendInvalidSave(
  page: Page,
  kind: InvalidSaveKind,
  grant: string,
): Promise<unknown> {
  return page.evaluate(async ({ invalidKind, liveGrant }) => {
    const saveDocument = window.api.saveDocument as unknown as (
      value: unknown,
    ) => Promise<unknown>;
    switch (invalidKind) {
      case "missing-version":
        return saveDocument({ grant: liveGrant, docId: "doc", epoch: 0 });
      case "fractional-version":
        return saveDocument({
          grant: liveGrant,
          docId: "doc",
          epoch: 0,
          version: 0.5,
        });
      case "object-grant":
        return saveDocument({ grant: {}, docId: "doc", epoch: 0, version: 0 });
      case "own-proto": {
        const hostile = { grant: liveGrant };
        Object.defineProperty(hostile, "__proto__", {
          enumerable: true,
          value: { polluted: true },
        });
        const chooseSaveTarget = window.api.chooseSaveTarget as unknown as (
          value: unknown,
        ) => Promise<unknown>;
        return chooseSaveTarget(hostile);
      }
      case "oversized-attach": {
        const attachDocument = window.api.attachDocument as unknown as (
          value: unknown,
        ) => Promise<unknown>;
        return attachDocument({
          docId: "doc",
          epoch: 0,
          version: 0,
          text: "x".repeat(257 * 1024 * 1024),
        });
      }
    }
  }, { invalidKind: kind, liveGrant: grant });
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
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-bad-save-"));
    const targetPath = path.join(temporaryDirectory, "target.md");
    await fs.writeFile(targetPath, "original", "utf8");
    const { application, page } = await launchEditor(fixturePath);

    try {
      await expect(page.getByTestId("editor")).toContainText("Sample document");
      const grant = await openGrant(application, page, targetPath);
      await stubSaveDialog(application, path.join(temporaryDirectory, "chosen.md"));
      const result = await sendInvalidSave(page, invalidCase.kind, grant);

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          messageKey: "request.invalid",
          retryable: false,
        },
      });
      expect(await fs.readdir(temporaryDirectory)).toEqual(["target.md"]);
      expect(await fs.readFile(targetPath, "utf8")).toBe("original");
      expect(await dialogCallCount(application, "save")).toBe(0);
      await expectRendererResponsive(page, invalidCase.kind);
    } finally {
      await closeEditor(application, page);
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

test.describe("the open-external contract", () => {
  let editor: Awaited<ReturnType<typeof launchEditor>> | undefined;

  test.beforeAll(async () => {
    editor = await launchEditor(fixturePath);
    await expect(editor.page.getByTestId("editor")).toContainText("Sample document");
    await editor.application.evaluate(({ shell }) => {
      const probe = globalThis as typeof globalThis & { externalUrls?: string[] };
      shell.openExternal = async (url) => {
        probe.externalUrls?.push(url);
      };
    });
  });

  test.afterAll(async () => {
    if (editor) {
      await closeEditor(editor.application, editor.page);
    }
  });

  for (const rejectedUrl of rejectedExternalUrls) {
    test(`rejects ${rejectedUrl.name}`, {
      tag: "@AC-SEC-08",
      annotation: { type: "AC-SEC-08" },
    }, async () => {
      if (!editor) {
        throw new Error("The shared editor did not launch");
      }
      const { application, page } = editor;
      await application.evaluate(() => {
        const probe = globalThis as typeof globalThis & { externalUrls?: string[] };
        probe.externalUrls = [];
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
    });
  }
});

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
        "attachDocument",
        "chooseSaveTarget",
        "chooseWorkspaceRoot",
        "clearDraft",
        "contributeMenu",
        "detachDocument",
        "draftDocument",
        "exportDocument",
        "listDrafts",
        "listWorkspaceChildren",
        "loadSession",
        "loadSettings",
        "onMenuCommand",
        "onOpenRequest",
        "onSessionCloseRequest",
        "openExternal",
        "openFile",
        "openWorkspaceFile",
        "readDocument",
        "readyForOpenRequests",
        "releaseDocument",
        "respondSessionClose",
        "saveDocument",
        "saveSettings",
        "sendChanges",
      ],
      legacyGlobal: false,
    });
  } finally {
    await closeEditor(application, page);
  }
});

test("page scripts cannot open a path or create a trusted drop", {
  tag: "@AC-SEC-09",
  annotation: { type: "AC-SEC-09" },
}, async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("tab")).toHaveCount(1);

    const exposed = await page.evaluate(() => ({
      openPath: "openPath" in window.api,
      pathForFile: "pathForFile" in window.api,
    }));
    expect(exposed).toEqual({ openPath: false, pathForFile: false });

    await page.evaluate(() => {
      window.dispatchEvent(new DragEvent("drop", {
        dataTransfer: new DataTransfer(),
      }));
    });
    await expect(page.getByTestId("tab")).toHaveCount(1);
  } finally {
    await closeEditor(application, page);
  }
});

test("the file-save contract rejects raw and forged grants", {
  tag: "@AC-SEC-09",
  annotation: { type: "AC-SEC-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-raw-grant-"));
  const targetPath = path.join(temporaryDirectory, "must-not-exist.md");
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect(page.getByTestId("editor")).toContainText("Sample document");

    for (const grant of [targetPath, "forged-grant"]) {
      const result = await page.evaluate(async (candidate) => {
        await window.api.attachDocument({
          docId: "security-doc",
          epoch: 0,
          version: 0,
          text: "must not be written",
        });
        return window.api.saveDocument({
          grant: candidate,
          docId: "security-doc",
          epoch: 0,
          version: 0,
        });
      }, grant);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "GRANT_INVALID" },
      });
    }
    expect(await fs.readdir(temporaryDirectory)).toEqual([]);
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the file-save contract rejects a released grant", {
  tag: "@AC-SEC-09",
  annotation: { type: "AC-SEC-09" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-revoked-grant-"));
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

    const result = await page.evaluate(async (grant) => {
      await window.api.attachDocument({
        docId: "released-doc",
        epoch: 0,
        version: 0,
        text: "must not be written",
      });
      return window.api.saveDocument({
        grant,
        docId: "released-doc",
        epoch: 0,
        version: 0,
      });
    }, firstGrant);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "GRANT_INVALID" },
    });
    expect(await fs.readFile(firstPath, "utf8")).toBe("first");
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
