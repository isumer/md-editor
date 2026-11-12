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
  editor: string | null,
  preview: string | null,
  theme: "light" | "dark" | "system" = "system",
): Promise<void> {
  await fs.writeFile(
    path.join(profileDirectory, "settings.json"),
    JSON.stringify({ theme, editor: { background: editor }, preview: { background: preview } }),
    "utf8",
  );
}

async function setColour(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).evaluate((input, colour) => {
    if (!(input instanceof HTMLInputElement)) throw new Error("colour input is missing");
    input.value = colour;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function storedSettings(profileDirectory: string): Promise<unknown> {
  const raw = await fs.readFile(path.join(profileDirectory, "settings.json"), "utf8");
  return JSON.parse(raw) as unknown;
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

test("AC-R7-01: separate editor and preview backgrounds survive a restart", {
  tag: "@AC-R7-01",
  annotation: { type: "AC-R7-01" },
}, async () => {
  const profile = await createUserDataDirectory();
  let editor = await launchEditor(fixturePath, profile);
  try {
    await editor.page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(editor.page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await setColour(editor.page, "#editor-background-input", "#123456");
    await setColour(editor.page, "#preview-background-input", "#abcdef");
    await expect.poll(() => paneColors(editor.page)).toMatchObject({
      editorBackground: "rgb(18, 52, 86)",
      previewBackground: "rgb(171, 205, 239)",
    });
    await expect.poll(() => storedSettings(profile)).toMatchObject({
      editor: { background: "#123456" },
      preview: { background: "#abcdef" },
    });

    await editor.application.close();
    editor = await launchEditor(fixturePath, profile);
    await expect.poll(() => paneColors(editor.page)).toMatchObject({
      editorBackground: "rgb(18, 52, 86)",
      previewBackground: "rgb(171, 205, 239)",
    });
  } finally {
    await closeEditor(editor.application, editor.page);
  }
});

test("AC-R7-02: a custom background overrides themes until reset", {
  tag: "@AC-R7-02",
  annotation: { type: "AC-R7-02" },
}, async () => {
  const profile = await createUserDataDirectory();
  await writeSettings(profile, null, "#123456", "dark");
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator("#background-theme-input").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => paneColors(page)).toMatchObject({
      previewBackground: "rgb(18, 52, 86)",
    });

    await page.locator("#preview-background-reset").click();
    await expect.poll(() => paneColors(page)).toMatchObject({
      previewBackground: "rgb(255, 255, 255)",
    });
    await expect.poll(() => storedSettings(profile)).toMatchObject({
      theme: "light",
      preview: { background: null },
    });
  } finally {
    await closeEditor(application, page);
  }
});

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
