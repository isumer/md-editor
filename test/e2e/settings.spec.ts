import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { contrastRatio, type Rgb } from "../../src/shared/settings/appearance";
import {
  closeEditor,
  createUserDataDirectory,
  fixturePath,
  launchEditor,
} from "./helpers";

interface PaneColors {
  editorBackground: string;
  editorText: string;
  previewBackground: string;
  previewText: string;
  systemDark: boolean;
}

async function writeSettings(
  profileDirectory: string,
  editor: string,
  preview: string,
): Promise<void> {
  await fs.writeFile(
    path.join(profileDirectory, "settings.json"),
    JSON.stringify({ editor: { background: editor }, preview: { background: preview } }),
    "utf8",
  );
}

async function paneColors(page: Page): Promise<PaneColors> {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>("#editor .cm-editor");
    const preview = document.querySelector<HTMLElement>("#preview");
    if (!editor || !preview) {
      throw new Error("background panes are missing");
    }
    const editorStyle = getComputedStyle(editor);
    const previewStyle = getComputedStyle(preview);
    return {
      editorBackground: editorStyle.backgroundColor,
      editorText: editorStyle.color,
      previewBackground: previewStyle.backgroundColor,
      previewText: previewStyle.color,
      systemDark: matchMedia("(prefers-color-scheme: dark)").matches,
    };
  });
}

function rgb(value: string): Rgb {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Unexpected CSS colour: ${value}`);
  }
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

test("AC-R7-03: invalid stored colours use the system theme", {
  tag: "@AC-R7-03",
  annotation: { type: "AC-R7-03" },
}, async () => {
  const profile = await createUserDataDirectory();
  await writeSettings(profile, "not-a-colour", "#12345");
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await expect(page.getByTestId("preview").locator("h1")).toHaveText(
      "Sample document",
    );
    const colors = await paneColors(page);
    const expected = colors.systemDark ? "rgb(13, 17, 23)" : "rgb(255, 255, 255)";
    expect(colors.editorBackground).toBe(expected);
    expect(colors.previewBackground).toBe(expected);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R7-04: custom backgrounds keep pane text readable", {
  tag: "@AC-R7-04",
  annotation: { type: "AC-R7-04" },
}, async () => {
  const profile = await createUserDataDirectory();
  await writeSettings(profile, "#000080", "#000080");
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    const colors = await paneColors(page);
    expect(colors.editorBackground).toBe("rgb(0, 0, 128)");
    expect(colors.previewBackground).toBe("rgb(0, 0, 128)");
    expect(colors.editorText).toBe("rgb(255, 255, 255)");
    expect(colors.previewText).toBe("rgb(255, 255, 255)");
    expect(contrastRatio(rgb(colors.editorBackground), rgb(colors.editorText)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(colors.previewBackground), rgb(colors.previewText)))
      .toBeGreaterThanOrEqual(4.5);
  } finally {
    await closeEditor(application, page);
  }
});

test("a failed settings read does not block the argv document", async () => {
  const profile = await createUserDataDirectory();
  await fs.mkdir(path.join(profile, "settings.json"));
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await expect(page).toHaveTitle("sample.md — SolidMD");
    await expect(page.getByTestId("preview").locator("h1")).toHaveText(
      "Sample document",
    );
  } finally {
    await closeEditor(application, page);
  }
});
