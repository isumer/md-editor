import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { expect, test, type ElectronApplication } from "@playwright/test";
import type { MessageBoxOptions } from "electron";

import {
  clickMenuItem,
  closeEditor,
  DOCUMENT_END,
  launchEditor,
} from "./helpers";

interface UpdateProbe {
  readonly dialog?: {
    readonly detail?: string;
    readonly message?: string;
    readonly title?: string;
  };
  readonly openedUrl?: string;
}

async function stubUpdateCheck(
  application: ElectronApplication,
  feed: "current" | "failed" | "newer",
  response: number,
): Promise<void> {
  await application.evaluate(({ dialog, net, shell }, input) => {
    const probe = globalThis as typeof globalThis & { updateProbe?: UpdateProbe };
    probe.updateProbe = {};
    net.fetch = async () => {
      if (input.feed === "failed") {
        throw new Error("offline");
      }
      const version = input.feed === "newer" ? "v9.8.7" : "v0.0.1";
      return new Response(JSON.stringify({
        tag_name: version,
        html_url: `https://github.com/isumer/solidmd/releases/tag/${version}`,
        body: "Release notes from the feed.",
      }), { status: 200 });
    };
    dialog.showMessageBox = async (options) => {
      const message = options as MessageBoxOptions;
      probe.updateProbe = { dialog: {
        detail: message.detail,
        message: message.message,
        title: message.title,
      } };
      return { checkboxChecked: false, response: input.response };
    };
    shell.openExternal = async (url) => {
      probe.updateProbe = { ...probe.updateProbe, openedUrl: url };
    };
  }, { feed, response });
}

async function readProbe(application: ElectronApplication): Promise<UpdateProbe> {
  return application.evaluate(() => {
    const probe = globalThis as typeof globalThis & { updateProbe?: UpdateProbe };
    return probe.updateProbe ?? {};
  });
}

async function waitForUpdateCheck(application: ElectronApplication): Promise<void> {
  await application.evaluate(() => new Promise<void>((resolve) => {
    setImmediate(resolve);
  }));
}

async function stubInstallableUpdate(
  application: ElectronApplication,
  input: {
    readonly appImagePath: string;
    readonly artifact: string;
    readonly checksum: string;
    readonly filename: string;
  },
): Promise<void> {
  await application.evaluate(({ dialog, net }, update) => {
    process.env.APPIMAGE = update.appImagePath;
    const probe = globalThis as typeof globalThis & { updateProbe?: UpdateProbe };
    probe.updateProbe = {};
    net.fetch = async (url) => {
      const address = String(url);
      if (address.endsWith("/releases/latest")) {
        return new Response(JSON.stringify({
          tag_name: "v9.8.7",
          html_url: "https://github.com/isumer/solidmd/releases/tag/v9.8.7",
          body: "A verified update.",
        }), { status: 200 });
      }
      if (address.endsWith("/SHA256SUMS.txt")) {
        return new Response(`${update.checksum}  ${update.filename}\n`);
      }
      return new Response(update.artifact);
    };
    dialog.showMessageBox = async (options) => {
      const message = options as MessageBoxOptions;
      probe.updateProbe = { dialog: {
        detail: message.detail,
        message: message.message,
        title: message.title,
      } };
      return {
        checkboxChecked: true,
        response: message.title === "Update available" ? 0 : 1,
      };
    };
  }, input);
}

function appImageFilename(arch: string): string {
  return `SolidMD-9.8.7-${arch === "x64" ? "x86_64" : arch}.AppImage`;
}

test("Check for Updates names a newer version and shows its release notes", {
  tag: "@AC-R9-07",
  annotation: { type: "AC-R9-07" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await stubUpdateCheck(application, "newer", 1);

    await clickMenuItem(application, "help-check-updates");

    await expect.poll(() => readProbe(application)).toMatchObject({ dialog: {
      detail: "Release notes from the feed.",
      message: "SolidMD v9.8.7 is available.",
      title: "Update available",
    } });
    await waitForUpdateCheck(application);
  } finally {
    await closeEditor(application, page);
  }
});

test("Check for Updates says the running version is current", {
  tag: "@AC-R9-07",
  annotation: { type: "AC-R9-07" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await stubUpdateCheck(application, "current", 0);

    await clickMenuItem(application, "help-check-updates");

    await expect.poll(() => readProbe(application)).toMatchObject({ dialog: {
      message: "SolidMD is up to date.",
      title: "Check for Updates",
    } });
    await waitForUpdateCheck(application);
  } finally {
    await closeEditor(application, page);
  }
});

test("Check for Updates reports an unreachable release feed", {
  tag: "@AC-R9-07",
  annotation: { type: "AC-R9-07" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await stubUpdateCheck(application, "failed", 0);

    await clickMenuItem(application, "help-check-updates");

    await expect.poll(() => readProbe(application)).toMatchObject({ dialog: {
      detail: "SolidMD could not reach the release feed. Try again later.",
      message: "The update check failed.",
    } });
    await waitForUpdateCheck(application);
  } finally {
    await closeEditor(application, page);
  }
});

test("automatic update checks can be turned off in update settings", {
  tag: "@AC-R9-08",
  annotation: { type: "AC-R9-08" },
}, async () => {
  const { application, page, userDataDir } = await launchEditor();
  try {
    await stubUpdateCheck(application, "current", 0);

    await clickMenuItem(application, "help-check-updates");

    await expect.poll(async () => {
      const raw = await fs.readFile(
        path.join(userDataDir, "settings.json"),
        "utf8",
      ).catch(() => "{}");
      const value = JSON.parse(raw) as { updates?: { enabled?: boolean } };
      return value.updates?.enabled;
    }).toBe(false);
  } finally {
    await closeEditor(application, page);
  }
});

test("an AppImage update waits for the quit prompt before replacement", {
  tag: "@AC-R9-09",
  annotation: { type: "AC-R9-09" },
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-update-e2e-"));
  const appImagePath = path.join(directory, "SolidMD.AppImage");
  const artifact = "new verified AppImage";
  const checksum = createHash("sha256").update(artifact).digest("hex");
  const launched = await launchEditor();
  let closed = false;
  try {
    await fs.writeFile(appImagePath, "old AppImage", "utf8");
    const arch = await launched.application.evaluate(() => process.arch);
    await stubInstallableUpdate(launched.application, {
      appImagePath,
      artifact,
      checksum,
      filename: appImageFilename(arch),
    });
    const editor = launched.page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toBeFocused();
    await launched.page.keyboard.press(DOCUMENT_END);
    await launched.page.keyboard.type("unsaved before update");

    await clickMenuItem(launched.application, "help-check-updates");
    await expect.poll(() => readProbe(launched.application)).toMatchObject({
      dialog: {
        message: "SolidMD v9.8.7 is ready to install.",
        title: "Update ready",
      },
    });

    const closing = launched.application.close();
    const prompt = launched.page.getByTestId("close-prompt");
    await expect(prompt).toBeVisible();
    await expect.poll(() => fs.readFile(appImagePath, "utf8")).toBe("old AppImage");
    await prompt.getByRole("button", { name: "Discard" }).click();
    await closing;
    closed = true;

    await expect.poll(() => fs.readFile(appImagePath, "utf8"))
      .toBe(artifact);
  } finally {
    if (!closed) {
      await closeEditor(launched.application, launched.page);
    }
    await fs.rm(launched.userDataDir, { force: true, recursive: true });
    await fs.rm(directory, { force: true, recursive: true });
  }
});

test("a tampered AppImage update stays unchanged and reports failure", {
  tag: "@AC-R9-11",
  annotation: { type: "AC-R9-11" },
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-update-e2e-"));
  const appImagePath = path.join(directory, "SolidMD.AppImage");
  const launched = await launchEditor();
  try {
    await fs.writeFile(appImagePath, "old AppImage", "utf8");
    const arch = await launched.application.evaluate(() => process.arch);
    await stubInstallableUpdate(launched.application, {
      appImagePath,
      artifact: "tampered AppImage",
      checksum: "0".repeat(64),
      filename: appImageFilename(arch),
    });

    await clickMenuItem(launched.application, "help-check-updates");

    await expect.poll(() => readProbe(launched.application)).toMatchObject({
      dialog: {
        detail: "Nothing was installed. Try again later.",
        message: "The update failed.",
      },
    });
    await expect.poll(() => fs.readFile(appImagePath, "utf8")).toBe("old AppImage");
    await expect.poll(() => fs.readdir(directory)).toEqual(["SolidMD.AppImage"]);
  } finally {
    await launched.application.evaluate(() => {
      delete process.env.APPIMAGE;
    }).catch(() => undefined);
    await closeEditor(launched.application, launched.page);
    await fs.rm(directory, { force: true, recursive: true });
  }
});

