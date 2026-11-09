import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import { closeEditor, launchEditor, repositoryRoot } from "./helpers";

const syncFixture = path.join(repositoryRoot, "test/fixtures/views/sync-scroll.md");
const run = promisify(execFile);
const TWENTY_MEGABYTES = "20971520";
let temporaryDirectory = "";
let large20 = "";

function sourceLineForText(
  source: readonly string[],
  visible: readonly string[],
): number {
  const index = source.findIndex((line, candidate) =>
    line === visible[0] && visible.every((text, offset) => source[candidate + offset] === text));
  if (index < 0) throw new Error("Visible editor lines are missing from the source");
  return index + 1;
}

test.beforeAll(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-sync-"));
  large20 = path.join(temporaryDirectory, "large-20mb.md");
  await run("node", [
    path.join(repositoryRoot, "test/fixtures/big/generate.mjs"),
    TWENTY_MEGABYTES,
    large20,
  ], { cwd: repositoryRoot });
});

test.afterAll(async () => {
  if (temporaryDirectory) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

async function scrollEditorToLine(page: import("@playwright/test").Page, line: number) {
  await page.getByTestId("editor").locator(".cm-scroller").evaluate((element, value) => {
    const line = element.querySelector<HTMLElement>(".cm-line");
    if (line === null) throw new Error("Editor has no visible line");
    const lineHeight = line.getBoundingClientRect().height;
    element.scrollTop = (value - 1) * lineHeight;
    element.dispatchEvent(new Event("scroll"));
  }, line);
}

test("AC-R3-01: editor scrolling brings the matching heading into preview", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await scrollEditorToLine(page, 96);

    await expect.poll(() => page.getByTestId("preview").evaluate((preview) => {
      const top = preview.getBoundingClientRect().top;
      const headings = [...preview.querySelectorAll("h2")];
      return headings.find((heading) => heading.getBoundingClientRect().bottom > top)?.textContent;
    })).toMatch(/Heading (19|20|21)/);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-02: preview scrolling brings the matching line into the editor", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    const heading = page.getByTestId("preview").getByRole("heading", { name: "Heading 20" });
    await expect(heading).toBeAttached();
    await heading.evaluate((element) => element.parentElement?.scrollIntoView());

    await expect.poll(() => page.getByTestId("editor").locator(".cm-scroller").evaluate((scroller) => {
      const top = scroller.getBoundingClientRect().top;
      const lines = [...scroller.querySelectorAll(".cm-line")];
      return lines.find((line) => line.getBoundingClientRect().bottom > top &&
        line.textContent?.startsWith("## "))?.textContent ?? "";
    }))
      .toMatch(/Heading (19|20|21)/);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-03: synchronized scrolling does not feed back", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await scrollEditorToLine(page, 110);
    await expect.poll(() => page.getByTestId("preview").evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const positions = await page.evaluate(() => ({
      editor: document.querySelector<HTMLElement>(".cm-scroller")?.scrollTop ?? -1,
      preview: document.querySelector<HTMLElement>("#preview")?.scrollTop ?? -1,
    }));
    const stabilityStart = Date.now();
    await expect.poll(async () => {
      const current = await page.evaluate(() => ({
        editor: document.querySelector<HTMLElement>(".cm-scroller")?.scrollTop ?? -1,
        preview: document.querySelector<HTMLElement>("#preview")?.scrollTop ?? -1,
      }));
      expect(current).toEqual(positions);
      return Date.now() - stabilityStart;
    }, { intervals: [100], timeout: 2_000 }).toBeGreaterThanOrEqual(1_000);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-04: the View menu disables sync scroll", async () => {
  const { application, page } = await launchEditor(syncFixture);
  try {
    await expect(page.getByTestId("preview").getByRole("heading", { name: "Heading 40" }))
      .toBeAttached();
    await application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("view-sync-scroll")?.click());
    const before = await page.getByTestId("preview").evaluate((element) => element.scrollTop);
    await scrollEditorToLine(page, 150);
    await expect.poll(() => page.getByTestId("preview").evaluate((element) => element.scrollTop))
      .toBe(before);
    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("syncScroll.enabled"))).toBe("false");
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R3-05: sync scroll keeps both panes within the frame budget", {
  tag: "@AC-PERF-20MB",
  annotation: { type: "AC-R3-05" },
}, async () => {
  test.setTimeout(420_000);
  const { application, page } = await launchEditor(large20);
  try {
    const preview = page.getByTestId("preview");
    await expect.poll(() => preview.evaluate((element) => element.dataset["renderComplete"]), {
      timeout: 300_000,
    }).toBe("true");
    await page.evaluate(() => localStorage.setItem("syncScroll.enabled", "true"));
    await page.reload();
    await expect.poll(() => preview.evaluate((element) => element.dataset["renderComplete"]), {
      timeout: 300_000,
    }).toBe("true");
    const measurements = await page.getByTestId("editor").locator(".cm-scroller")
      .evaluate(async (editor) => {
        const preview = document.querySelector<HTMLElement>("#preview");
        if (preview === null) throw new Error("Preview is missing");
        const editorFrames: number[] = [];
        const previewFrames: number[] = [];
        const maximum = editor.scrollHeight - editor.clientHeight;
        for (let index = 0; index < 30; index += 1) {
          const editorStart = performance.now();
          editor.scrollTop = maximum * ((index + 1) / 30);
          editor.dispatchEvent(new Event("scroll"));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          editorFrames.push(performance.now() - editorStart);
          const previewStart = performance.now();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          previewFrames.push(performance.now() - previewStart);
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const editorTop = editor.getBoundingClientRect().top;
        const editorLines = [...editor.querySelectorAll<HTMLElement>(".cm-line")];
        const firstEditorLine = editorLines.findIndex((line) =>
          line.getBoundingClientRect().bottom > editorTop);
        const editorText = editorLines.slice(firstEditorLine, firstEditorLine + 3)
          .map((line) => line.textContent ?? "");
        const previewTop = preview.getBoundingClientRect().top;
        const previewLine = Number([...preview.querySelectorAll<HTMLElement>(".preview-block")]
          .find((block) => block.getBoundingClientRect().bottom > previewTop)
          ?.dataset["line"] ?? -1) + 1;
        return { editorFrames, previewFrames, editorText, previewLine };
      });
    const editorLine = sourceLineForText(
      (await fs.readFile(large20, "utf8")).split("\n"),
      measurements.editorText,
    );
    console.log(
      `AC-R3-05 frames: editor max ${Math.max(...measurements.editorFrames).toFixed(2)} ms, ` +
      `preview max ${Math.max(...measurements.previewFrames).toFixed(2)} ms`,
    );
    expect(Math.max(...measurements.editorFrames)).toBeLessThanOrEqual(32);
    expect(Math.max(...measurements.previewFrames)).toBeLessThanOrEqual(32);
    expect(Math.abs(measurements.previewLine - editorLine)).toBeLessThanOrEqual(2);
  } finally {
    await closeEditor(application, page);
  }
});
