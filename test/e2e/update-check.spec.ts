import { expect, test, type ElectronApplication } from "@playwright/test";
import type { MessageBoxOptions } from "electron";

import { clickMenuItem, closeEditor, launchEditor } from "./helpers";

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

