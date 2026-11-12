import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { contrastRatio, type Rgb } from "../../src/shared/settings/appearance";
import {
  closeEditor,
  createUserDataDirectory,
  fixturePath,
  launchEditor,
  PRIMARY_MODIFIER,
  repositoryRoot,
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

async function writeJsonSettings(
  profileDirectory: string,
  settings: unknown,
): Promise<void> {
  await fs.writeFile(
    path.join(profileDirectory, "settings.json"),
    JSON.stringify(settings),
    "utf8",
  );
}

async function waitForTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.waitForFunction(
    (expected) => document.documentElement.dataset["theme"] === expected,
    theme,
  );
}

interface PreviewStyles {
  headingBorder: string;
  headingPadding: string;
  quoteBorder: string;
  tableBorder: string;
  headerBackground: string;
  codeBackground: string;
  scriptKeywordColor: string;
  scriptCommentColor: string;
  pythonKeywordColor: string;
}

async function waitForPreviewBlocks(page: Page): Promise<void> {
  // Blocks arrive in time-budgeted slices, so the heading can be on screen
  // while the quote, table and code blocks are still queued.
  await page.waitForFunction(() => {
    const selectors = [
      "#preview h1",
      "#preview blockquote",
      "#preview th",
      "#preview pre",
      "#preview code.language-js .hljs-keyword",
      "#preview code.language-js .hljs-comment",
      "#preview code.language-python .hljs-keyword",
    ];
    return selectors.every((selector) => document.querySelector(selector) !== null);
  });
}

async function previewStyles(page: Page): Promise<PreviewStyles> {
  await waitForPreviewBlocks(page);
  return page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>("#preview h1");
    const quote = document.querySelector<HTMLElement>("#preview blockquote");
    const header = document.querySelector<HTMLElement>("#preview th");
    const code = document.querySelector<HTMLElement>("#preview pre");
    const script = document.querySelector<HTMLElement>(
      "#preview code.language-js .hljs-keyword",
    );
    const scriptComment = document.querySelector<HTMLElement>(
      "#preview code.language-js .hljs-comment",
    );
    const python = document.querySelector<HTMLElement>(
      "#preview code.language-python .hljs-keyword",
    );
    if (!heading || !quote || !header || !code || !script || !scriptComment ||
      !python) {
      throw new Error("preview elements are missing");
    }
    return {
      headingBorder: getComputedStyle(heading).borderBottomStyle,
      headingPadding: getComputedStyle(heading).paddingBottom,
      quoteBorder: getComputedStyle(quote).borderLeftStyle,
      tableBorder: getComputedStyle(header).borderTopStyle,
      headerBackground: getComputedStyle(header).backgroundColor,
      codeBackground: getComputedStyle(code).backgroundColor,
      scriptKeywordColor: getComputedStyle(script).color,
      scriptCommentColor: getComputedStyle(scriptComment).color,
      pythonKeywordColor: getComputedStyle(python).color,
    };
  });
}

test("AC-R08-02: a corrupt settings file loads defaults and stays unchanged", {
  tag: "@AC-R08-02",
  annotation: { type: "AC-R08-02" },
}, async () => {
  const profile = await createUserDataDirectory();
  const corrupt = '{"theme": "dark", "font';
  await fs.writeFile(path.join(profile, "settings.json"), corrupt, "utf8");
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await expect(page.getByTestId("preview").locator("h1")).toHaveText(
      "Sample document",
    );
    await page.waitForFunction(
      () => document.documentElement.dataset["theme"] !== undefined,
    );
    expect(await fs.readFile(path.join(profile, "settings.json"), "utf8"))
      .toBe(corrupt);
    await expect(page.getByTestId("status")).toHaveText("");
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R08-03: light and dark themes style the editor, preview and chrome", {
  tag: "@AC-R08-03",
  annotation: { type: "AC-R08-03" },
}, async () => {
  const lightProfile = await createUserDataDirectory();
  await writeJsonSettings(lightProfile, { theme: "light" });
  const light = await launchEditor(fixturePath, lightProfile);
  try {
    await waitForTheme(light.page, "light");
    const colors = await paneColors(light.page);
    expect(colors.editorBackground).toBe("rgb(255, 255, 255)");
    expect(colors.previewBackground).toBe("rgb(255, 255, 255)");
    expect(await light.page.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme)).toBe("light");
    expect(await light.page.getByTestId("tabs").evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe("rgb(246, 248, 250)");
  } finally {
    await closeEditor(light.application, light.page);
  }

  const darkProfile = await createUserDataDirectory();
  await writeJsonSettings(darkProfile, { theme: "dark" });
  const dark = await launchEditor(fixturePath, darkProfile);
  try {
    await waitForTheme(dark.page, "dark");
    const colors = await paneColors(dark.page);
    expect(colors.editorBackground).toBe("rgb(13, 17, 23)");
    expect(colors.previewBackground).toBe("rgb(13, 17, 23)");
    expect(await dark.page.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    expect(await dark.page.getByTestId("tabs").evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe("rgb(22, 27, 34)");
  } finally {
    await closeEditor(dark.application, dark.page);
  }
});

test("AC-R08-03: the system theme follows an operating system change", {
  tag: "@AC-R08-03",
  annotation: { type: "AC-R08-03" },
}, async () => {
  const profile = await createUserDataDirectory();
  await writeJsonSettings(profile, { theme: "system" });
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await page.emulateMedia({ colorScheme: "light" });
    await waitForTheme(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await waitForTheme(page, "dark");
    expect((await paneColors(page)).previewBackground).toBe("rgb(13, 17, 23)");
  } finally {
    await closeEditor(application, page);
  }
});

function cursorLine(page: Page): Promise<number> {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const line = element?.closest(".cm-line");
    return line ? Array.from(document.querySelectorAll(".cm-line")).indexOf(line) : -1;
  });
}

async function editorFontSize(page: Page): Promise<string> {
  return page.locator("#editor .cm-editor").evaluate((element) =>
    getComputedStyle(element).fontSize);
}

test("AC-R08-05: font size changes at once, keeps the cursor and is saved", {
  tag: "@AC-R08-05",
  annotation: { type: "AC-R08-05" },
}, async () => {
  const profile = await createUserDataDirectory();
  const { application, page } = await launchEditor(fixturePath, profile);
  try {
    await page.locator("#editor .cm-content").click();
    const line = await cursorLine(page);
    expect(line).toBeGreaterThanOrEqual(0);
    expect(await editorFontSize(page)).toBe("14px");

    await page.keyboard.press(`${PRIMARY_MODIFIER}+=`);
    await page.keyboard.press(`${PRIMARY_MODIFIER}+=`);
    expect(await editorFontSize(page)).toBe("16px");
    expect(await cursorLine(page)).toBe(line);

    await page.keyboard.press(`${PRIMARY_MODIFIER}+-`);
    expect(await editorFontSize(page)).toBe("15px");

    await expect.poll(async () => JSON.parse(
      await fs.readFile(path.join(profile, "settings.json"), "utf8"),
    ).fontSize).toBe(15);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R08-06: the preview uses GitHub-style rules and readable code colours", {
  tag: "@AC-R08-06",
  annotation: { type: "AC-R08-06" },
}, async () => {
  const fixture = path.join(repositoryRoot, "test/fixtures/settings/preview-styles.md");
  const lightProfile = await createUserDataDirectory();
  await writeJsonSettings(lightProfile, { theme: "light" });
  const light = await launchEditor(fixture, lightProfile);
  try {
    await waitForTheme(light.page, "light");
    await expect(light.page.getByTestId("preview").locator("h1")).toHaveText(
      "Styled preview",
    );
    const styles = await previewStyles(light.page);
    expect(styles.headingBorder).toBe("solid");
    expect(styles.headingPadding).not.toBe("0px");
    expect(styles.quoteBorder).toBe("solid");
    expect(styles.tableBorder).toBe("solid");
    expect(styles.headerBackground).toBe("rgb(246, 248, 250)");
    expect(styles.codeBackground).toBe("rgb(246, 248, 250)");
    expect(contrastRatio(rgb(styles.scriptKeywordColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(styles.scriptCommentColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(styles.pythonKeywordColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
  } finally {
    await closeEditor(light.application, light.page);
  }

  const darkProfile = await createUserDataDirectory();
  await writeJsonSettings(darkProfile, { theme: "dark" });
  const dark = await launchEditor(fixture, darkProfile);
  try {
    await waitForTheme(dark.page, "dark");
    await expect(dark.page.getByTestId("preview").locator("h1")).toHaveText(
      "Styled preview",
    );
    const styles = await previewStyles(dark.page);
    expect(styles.codeBackground).toBe("rgb(22, 27, 34)");
    expect(styles.headerBackground).toBe("rgb(21, 27, 35)");
    expect(contrastRatio(rgb(styles.scriptKeywordColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(styles.scriptCommentColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(styles.pythonKeywordColor), rgb(styles.codeBackground)))
      .toBeGreaterThanOrEqual(4.5);
  } finally {
    await closeEditor(dark.application, dark.page);
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
