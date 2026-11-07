import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { clickMenuItem, launchEditor, repositoryRoot } from "./helpers";

const fixture = path.join(repositoryRoot, "test/fixtures/views/sync-scroll.md");
const run = promisify(execFile);

async function ensureSyncEnabled(
  application: Awaited<ReturnType<typeof launchEditor>>["application"],
): Promise<void> {
  const enabled = await application.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.getMenuItemById("view-sync-scroll")?.checked);
  if (!enabled) {
    await clickMenuItem(application, "view-sync-scroll");
  }
}

async function scrollEditorToLine(page: Page, line: number): Promise<void> {
  await page.locator("#editor .cm-scroller").evaluate((scroller, targetLine) => {
    const lineElement = scroller.querySelector<HTMLElement>(".cm-line");
    const lineHeight = lineElement?.getBoundingClientRect().height ?? 20;
    scroller.scrollTop = (targetLine - 1) * lineHeight;
    scroller.dispatchEvent(new Event("scroll"));
  }, line);
}

test.describe.configure({ timeout: 420_000 });

test("AC-R3-01 AC-R3-03: editor scroll moves preview once without feedback", {
  tag: ["@AC-R3-01", "@AC-R3-03"],
  annotation: [{ type: "AC-R3-01" }, { type: "AC-R3-03" }],
}, async () => {
  const { application, page } = await launchEditor(fixture);
  try {
    await expect(page.getByTestId("preview").getByText("Heading 21", { exact: true }))
      .toBeVisible();
    await ensureSyncEnabled(application);
    await page.evaluate(() => {
      const scope = window as unknown as { __syncEvents?: { editor: number; preview: number } };
      scope.__syncEvents = { editor: 0, preview: 0 };
      document.querySelector("#editor .cm-scroller")?.addEventListener("scroll", () => {
        if (scope.__syncEvents) scope.__syncEvents.editor += 1;
      });
      document.querySelector("#preview")?.addEventListener("scroll", () => {
        if (scope.__syncEvents) scope.__syncEvents.preview += 1;
      });
    });

    await scrollEditorToLine(page, 119);
    const block = page.getByTestId("preview").getByText("Heading 21", { exact: true })
      .locator("xpath=ancestor::*[contains(@class,'preview-block')]");
    await expect.poll(async () => block.evaluate((element) => {
      const preview = document.querySelector<HTMLElement>("#preview");
      return preview
        ? Math.abs(element.getBoundingClientRect().top - preview.getBoundingClientRect().top)
        : 1000;
    })).toBeLessThan(2);
    const counts = await page.evaluate(() =>
      (window as unknown as { __syncEvents?: { editor: number; preview: number } }).__syncEvents);
    expect(counts?.preview).toBe(1);
    expect(counts?.editor).toBeLessThanOrEqual(2);
  } finally {
    await application.close();
  }
});

test("AC-R3-02: preview scroll moves the editor to the source line", {
  tag: "@AC-R3-02",
  annotation: { type: "AC-R3-02" },
}, async () => {
  const { application, page } = await launchEditor(fixture);
  try {
    await expect(page.getByTestId("preview").getByText("Heading 30", { exact: true }))
      .toBeVisible();
    await ensureSyncEnabled(application);
    await page.getByTestId("preview").getByText("Heading 30", { exact: true }).evaluate(
      (element) => {
        element.closest<HTMLElement>(".preview-block")?.scrollIntoView({ block: "start" });
        document.querySelector("#preview")?.dispatchEvent(new Event("scroll"));
      },
    );
    await expect.poll(() => page.locator("#editor .cm-scroller").evaluate((scroller) => {
      const first = scroller.querySelector<HTMLElement>(".cm-line");
      const lineHeight = first?.getBoundingClientRect().height ?? 20;
      return Math.round(scroller.scrollTop / lineHeight) + 1;
    })).toBeGreaterThanOrEqual(158);
  } finally {
    await application.close();
  }
});

test("AC-R3-04: the sync setting survives restart", {
  tag: "@AC-R3-04",
  annotation: { type: "AC-R3-04" },
}, async () => {
  let launched = await launchEditor(fixture);
  try {
    await ensureSyncEnabled(launched.application);
    await clickMenuItem(launched.application, "view-sync-scroll");
    await expect.poll(() => launched.application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("view-sync-scroll")?.checked)).toBe(false);
    await launched.application.close();

    launched = await launchEditor(fixture);
    await expect.poll(() => launched.application.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.getMenuItemById("view-sync-scroll")?.checked)).toBe(false);
    const preview = launched.page.getByTestId("preview");
    const before = await preview.evaluate((element) => element.scrollTop);
    await scrollEditorToLine(launched.page, 119);
    expect(await preview.evaluate((element) => element.scrollTop)).toBe(before);
  } finally {
    await launched.application.close();
  }
});

test("AC-R3-05: sync scroll coalesces a fling to animation frames", {
  tag: "@AC-R3-05",
  annotation: { type: "AC-R3-05" },
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-sync-scroll-"));
  const large20 = path.join(directory, "large-20mb.md");
  await run("node", [
    path.join(repositoryRoot, "test/fixtures/big/generate.mjs"),
    "20971520",
    large20,
  ], { cwd: repositoryRoot });
  const { application, page } = await launchEditor(large20);
  try {
    await expect(page.getByTestId("preview").locator(".preview-block").first())
      .toBeVisible({ timeout: 30_000 });
    await ensureSyncEnabled(application);
    const result = await page.locator("#editor .cm-scroller").evaluate(async (scroller) => {
      const preview = document.querySelector<HTMLElement>("#preview");
      const frames: number[] = [];
      let previous = performance.now();
      for (let index = 0; index < 30; index += 1) {
        scroller.scrollTop += 40;
        scroller.dispatchEvent(new Event("scroll"));
        await new Promise<void>((resolve) => requestAnimationFrame((time) => {
          frames.push(time - previous);
          previous = time;
          resolve();
        }));
      }
      return { frames, previewTop: preview?.scrollTop ?? 0 };
    });
    const sorted = [...result.frames].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
    console.log(`AC-R3-05 frame p95: ${p95.toFixed(1)} ms`);
    expect(result.frames).toHaveLength(30);
    expect(result.previewTop).toBeGreaterThan(0);
    expect(p95).toBeLessThanOrEqual(32);
  } finally {
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
