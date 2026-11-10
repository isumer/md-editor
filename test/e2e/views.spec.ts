import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  DOCUMENT_START,
  fixturePath,
  launchEditor,
  PRIMARY_MODIFIER,
  repositoryRoot,
} from "./helpers";

interface PreviewPosition {
  readonly blockId: string;
  readonly line: string;
}

async function settledPreviewPosition(
  preview: import("@playwright/test").Locator,
): Promise<PreviewPosition> {
  return preview.evaluate(async (element) => {
    const read = (): PreviewPosition => {
      const top = element.getBoundingClientRect().top;
      const block = [...element.querySelectorAll<HTMLElement>(".preview-block")]
        .find((candidate) => candidate.getBoundingClientRect().bottom > top);
      return { blockId: block?.dataset["blockId"] ?? "", line: block?.dataset["line"] ?? "" };
    };
    const before = read();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = read();
    if (before.blockId !== after.blockId || before.line !== after.line) {
      throw new Error("Preview layout did not settle");
    }
    return after;
  });
}

async function nativeFullScreen(
  application: import("@playwright/test").ElectronApplication,
): Promise<boolean> {
  return application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false);
}

async function measureInputAfterTransition(
  page: import("@playwright/test").Page,
  transition: string,
): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  const heading = page.getByTestId("preview").locator("h1").first();
  await editor.click();
  await page.keyboard.press(DOCUMENT_START);
  await page.keyboard.press("End");
  for (let index = 0; index < 5; index += 1) {
    const before = await heading.textContent();
    await page.keyboard.type("w");
    await expect.poll(() => heading.textContent()).not.toBe(before);
  }
  const samples: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const character = String.fromCharCode(97 + (index % 26));
    const before = await heading.textContent();
    await page.evaluate(() => performance.clearMeasures("preview-latency"));
    await page.keyboard.type(character);
    await expect.poll(() => heading.textContent(), { timeout: 10_000 }).not.toBe(before);
    const durations = await page.evaluate(() =>
      performance.getEntriesByName("preview-latency", "measure")
        .map((entry) => entry.duration));
    samples.push(durations.at(-1) ?? Infinity);
  }
  samples.sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
  console.log(`${transition} input distribution: p95 ${p95.toFixed(2)} ms`);
  expect(p95).toBeLessThan(100);
}

test("AC-R2-01: the View menu switches all pane modes", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const editor = page.getByTestId("editor");
    const preview = page.getByTestId("preview");
    await expect(preview.locator("h1")).toHaveText("Sample document");
    await clickMenuItem(application, "view-sync-scroll");
    await editor.locator(".cm-scroller").evaluate((element) => { element.scrollTop = 10; });
    await preview.evaluate((element) => { element.scrollTop = 10; });
    const originalText = await editor.locator(".cm-content").textContent();
    const editorTop = await editor.locator(".cm-scroller").evaluate((element) => element.scrollTop);
    const previewTop = await preview.evaluate((element) => element.scrollTop);

    await clickMenuItem(application, "view-editor");
    await expect(editor).toBeVisible();
    await expect(preview).toBeHidden();
    await clickMenuItem(application, "view-preview");
    await expect(editor).toBeHidden();
    await expect(preview).toBeVisible();
    await clickMenuItem(application, "view-split");
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(editor.locator(".cm-content")).toHaveText(originalText ?? "");
    expect(await editor.locator(".cm-scroller").evaluate((element) => element.scrollTop))
      .toBe(editorTop);
    expect(await preview.evaluate((element) => element.scrollTop)).toBe(previewTop);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-02: the divider drags to 30 percent and resets", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const workspace = page.getByTestId("editor").locator("..");
    const divider = page.getByTestId("divider");
    const bounds = await workspace.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds === null) throw new Error("Workspace has no bounds");
    await divider.hover();
    await page.mouse.down();
    const editorLeft = await page.getByTestId("editor").evaluate((element) => element.getBoundingClientRect().left);
    await page.mouse.move(editorLeft + bounds.width * 0.3, bounds.y + 100);
    await page.mouse.up();

    const share = await page.getByTestId("editor").evaluate((element) => {
      const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
      return element.getBoundingClientRect().width / parentWidth;
    });
    expect(share).toBeCloseTo(0.3, 1);
    await page.reload();
    await expect(page.getByTestId("divider")).toBeVisible();
    const restoredShare = await page.getByTestId("editor").evaluate((element) => {
      const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
      return element.getBoundingClientRect().width / parentWidth;
    });
    expect(restoredShare).toBeCloseTo(0.3, 1);
    await divider.dblclick();
    const resetShare = await page.getByTestId("editor").evaluate((element) => {
      const parentWidth = element.parentElement?.getBoundingClientRect().width ?? 0;
      return element.getBoundingClientRect().width / parentWidth;
    });
    expect(resetShare).toBeCloseTo(0.5, 1);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-03: Full Screen uses the operating system state", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false)).toBe(true);
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? true)).toBe(false);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-04: focus mode hides chrome and Escape restores it", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const workspaceSidebar = page.getByRole("complementary", { name: "Workspace" });
    await page.getByTestId("editor").locator(".cm-content").click();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+F`);
    await expect(page.getByTestId("tabs")).toBeHidden();
    await expect(workspaceSidebar).toBeHidden();
    await expect(page.getByTestId("status")).toBeHidden();
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false)).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => nativeFullScreen(application)).toBe(false);
    await expect(page.getByTestId("tabs")).toBeVisible();
    await expect(workspaceSidebar).toBeVisible();
    await expect(page.getByTestId("status")).toBeVisible();
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-05: continuous resize preserves the preview block and frame budget", async () => {
  test.setTimeout(60_000);
  const largeFixture = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");
  const { application, page } = await launchEditor(largeFixture);
  try {
    const preview = page.getByTestId("preview");
    await expect.poll(() => preview.evaluate((element) => element.dataset["renderComplete"]), {
      timeout: 30_000,
    }).toBe("true");
    await preview.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
    const topBlock = await settledPreviewPosition(preview);
    // Wait for a quiet page so editor background parsing cannot land inside the burst.
    await page.evaluate(() => new Promise<void>((resolve) => {
      const observer = new PerformanceObserver(() => {});
      observer.observe({ type: "longtask" });
      const startedAt = performance.now();
      let lastTaskAt = startedAt;
      const timer = setInterval(() => {
        if (observer.takeRecords().length > 0) lastTaskAt = performance.now();
        if (performance.now() - lastTaskAt >= 1_000 || performance.now() - startedAt >= 15_000) {
          observer.disconnect();
          clearInterval(timer);
          resolve();
        }
      }, 250);
    }));
    const [measurements] = await Promise.all([
      page.evaluate(async () => {
        const frames: number[] = [];
        const longTaskStarts: number[] = [];
        const observer = new PerformanceObserver((list) => {
          longTaskStarts.push(...list.getEntries().map((entry) => entry.startTime));
        });
        observer.observe({ type: "longtask" });
        const windowStart = performance.now();
        let previous = performance.now();
        for (let index = 0; index < 120; index += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame((now) => {
            frames.push(now - previous);
            previous = now;
            resolve();
          }));
        }
        const windowEnd = performance.now();
        longTaskStarts.push(...observer.takeRecords().map((entry) => entry.startTime));
        observer.disconnect();
        const longTasks = longTaskStarts.filter((start) =>
          start >= windowStart && start <= windowEnd).length;
        return { frames: frames.sort((left, right) => left - right), longTasks };
      }),
      application.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        await new Promise<void>((resolve) => {
          let count = 0;
          const timer = setInterval(() => {
            window?.setSize(count % 2 === 0 ? 1_100 : 1_200, 800);
            count += 1;
            if (count === 120) {
              clearInterval(timer);
              resolve();
            }
          }, 16);
        });
      }),
    ]);
    const p95 = measurements.frames[Math.ceil(measurements.frames.length * 0.95) - 1] ?? Infinity;
    console.log(`resize frame distribution: p95 ${p95.toFixed(2)} ms, max ${String(Math.max(...measurements.frames))} ms`);
    expect(p95).toBeLessThanOrEqual(32);
    expect(measurements.longTasks).toBe(0);
    const topBlockAfter = await settledPreviewPosition(preview);
    expect(topBlockAfter).toEqual(topBlock);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-06: full screen and focus transitions keep input below 100 milliseconds", async () => {
  test.setTimeout(60_000);
  const largeFixture = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");
  const { application, page } = await launchEditor(largeFixture);
  try {
    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => nativeFullScreen(application)).toBe(true);
    await measureInputAfterTransition(page, "enter full screen");

    await clickMenuItem(application, "view-full-screen");
    await expect.poll(() => nativeFullScreen(application)).toBe(false);
    await measureInputAfterTransition(page, "leave full screen");

    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+F`);
    await expect.poll(() => nativeFullScreen(application)).toBe(true);
    await measureInputAfterTransition(page, "enter focus mode");

    await page.keyboard.press("Escape");
    await expect.poll(() => nativeFullScreen(application)).toBe(false);
    await measureInputAfterTransition(page, "leave focus mode");
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-07: a wide preview keeps a 900 pixel text column", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await clickMenuItem(application, "view-preview");
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1_400, 800));
    await expect.poll(() => page.locator(".preview-document").evaluate((element) =>
      Math.round(element.getBoundingClientRect().width))).toBe(900);
  } finally {
    await closeEditor(application, page);
  }
});
