import path from "node:path";

import { expect, test } from "@playwright/test";

import { clickMenuItem, launchEditor, repositoryRoot } from "./helpers";

const fixture = path.join(repositoryRoot, "test/fixtures/views/sync-scroll.md");
const large500 = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");
const PRIMARY_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

test.describe.configure({ timeout: 60_000 });

async function editorWidthPercent(page: Awaited<ReturnType<typeof launchEditor>>["page"]): Promise<number> {
  return page.locator("#workspace").evaluate((workspace) => {
    const editor = workspace.querySelector<HTMLElement>("#editor");
    return editor ? (editor.getBoundingClientRect().width / workspace.getBoundingClientRect().width) * 100 : 0;
  });
}

test("AC-R2-01: the View menu changes panes without changing the document", {
  tag: "@AC-R2-01",
  annotation: { type: "AC-R2-01" },
}, async () => {
  const { application, page } = await launchEditor(fixture);
  try {
    const editor = page.getByTestId("editor");
    const preview = page.getByTestId("preview");
    await expect(preview.getByText("Heading 01", { exact: true })).toBeVisible();
    const text = await editor.locator(".cm-content").textContent();

    await clickMenuItem(application, "view-editor");
    await expect(editor).toBeVisible();
    await expect(preview).toBeHidden();

    await clickMenuItem(application, "view-preview");
    await expect(editor).toBeHidden();
    await expect(preview).toBeVisible();

    await clickMenuItem(application, "view-split");
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    expect(await editor.locator(".cm-content").textContent()).toBe(text);
  } finally {
    await application.close();
  }
});

test("AC-R2-02: the divider drags, survives restart, and resets", {
  tag: "@AC-R2-02",
  annotation: { type: "AC-R2-02" },
}, async () => {
  let launched = await launchEditor(fixture);
  try {
    const workspace = launched.page.locator("#workspace");
    const divider = launched.page.getByTestId("view-divider");
    const box = await workspace.boundingBox();
    const dividerBox = await divider.boundingBox();
    if (!box || !dividerBox) {
      throw new Error("The split view has no bounds");
    }
    await launched.page.mouse.move(
      dividerBox.x + dividerBox.width / 2,
      dividerBox.y + 20,
    );
    await launched.page.mouse.down();
    await launched.page.mouse.move(box.x + box.width * 0.3, box.y + 20);
    await launched.page.mouse.up();
    expect(await editorWidthPercent(launched.page)).toBeCloseTo(30, 0);
    await launched.application.close();

    launched = await launchEditor(fixture);
    expect(await editorWidthPercent(launched.page)).toBeCloseTo(30, 0);
    await launched.page.getByTestId("view-divider").dblclick();
    expect(await editorWidthPercent(launched.page)).toBeCloseTo(50, 0);
  } finally {
    await launched.application.close();
  }
});

test("AC-R2-03: Full Screen enters and leaves operating-system full screen", {
  tag: "@AC-R2-03",
  annotation: { type: "AC-R2-03" },
}, async () => {
  const { application } = await launchEditor(fixture);
  try {
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(false);
  } finally {
    await application.close();
  }
});

test("AC-R2-04 AC-R2-06: focus mode hides chrome and Escape restores it", {
  tag: ["@AC-R2-04", "@AC-R2-06"],
  annotation: [{ type: "AC-R2-04" }, { type: "AC-R2-06" }],
}, async () => {
  const { application, page } = await launchEditor(fixture);
  try {
    await page.getByTestId("editor").locator(".cm-content").click();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+f`);
    await expect(page.locator("#status")).toBeHidden();
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(false);
  } finally {
    await application.close();
  }
});

test("AC-R2-05 AC-R2-07: resize keeps frames, the visible block, and a 900 px column", {
  tag: ["@AC-R2-05", "@AC-R2-07"],
  annotation: [{ type: "AC-R2-05" }, { type: "AC-R2-07" }],
}, async () => {
  const { application, page } = await launchEditor(large500);
  try {
    const preview = page.getByTestId("preview");
    await expect(preview).toHaveAttribute("data-render-complete", "true", { timeout: 30_000 });
    await preview.locator(".preview-block").nth(200).scrollIntoViewIfNeeded();
    const topBlockId = () => preview.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 25)
        ?.closest<HTMLElement>(".preview-block")?.dataset["blockId"];
    });
    const before = await topBlockId();
    const framesPromise = page.evaluate(async () => {
      const frames: number[] = [];
      const longTasks: number[] = [];
      new PerformanceObserver((list) => {
        longTasks.push(...list.getEntries().map((entry) => entry.duration));
      }).observe({ type: "longtask" });
      let previous = performance.now();
      for (let index = 0; index < 150; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame((time) => {
          frames.push(time - previous);
          previous = time;
          resolve();
        }));
      }
      return { frames, longTasks };
    });
    await application.evaluate(async ({ BrowserWindow }) => {
      await new Promise<void>((resolve) => {
        let sample = 0;
        const timer = setInterval(() => {
          const window = BrowserWindow.getAllWindows()[0];
          const bounds = window?.getBounds();
          if (window && bounds) {
            window.setBounds({ ...bounds, width: 1000 + (sample % 31) * 10 });
          }
          sample += 1;
          if (sample === 120) {
            clearInterval(timer);
            resolve();
          }
        }, 16);
      });
    });
    const performanceResult = await framesPromise;
    const sorted = [...performanceResult.frames].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
    console.log(`AC-R2-05 frame p95: ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThanOrEqual(32);
    expect(performanceResult.longTasks).toEqual([]);
    expect(await topBlockId()).toBe(before);
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const bounds = window?.getBounds();
      if (window && bounds) {
        window.setBounds({ ...bounds, width: 2200 });
      }
    });
    const width = await page.locator("#preview .preview-section").first().evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(width).toBeCloseTo(900, 0);
  } finally {
    await application.close();
  }
});
