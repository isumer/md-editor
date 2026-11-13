import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  DOCUMENT_END,
  DOCUMENT_START,
  fixturePath,
  launchEditor,
  PRIMARY_MODIFIER,
  removeProfileDirectory,
  repositoryRoot,
} from "./helpers";

const largeFixturePath = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");
const resizeFixturePath = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");

interface PreviewPosition {
  readonly blockId: string;
  readonly line: string;
}

async function previewPosition(
  preview: import("@playwright/test").Locator,
): Promise<PreviewPosition> {
  return preview.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const block = [...element.querySelectorAll<HTMLElement>(".preview-block")]
      .find((candidate) => candidate.getBoundingClientRect().bottom > top);
    return { blockId: block?.dataset["blockId"] ?? "", line: block?.dataset["line"] ?? "" };
  });
}

async function positionDuringResizeSettle(
  preview: import("@playwright/test").Locator,
  expected: PreviewPosition,
): Promise<{ readonly changed: boolean; readonly final: PreviewPosition }> {
  return preview.evaluate(async (element, expectedPosition) => {
    const read = (): PreviewPosition => {
      const top = element.getBoundingClientRect().top;
      const block = [...element.querySelectorAll<HTMLElement>(".preview-block")]
        .find((candidate) => candidate.getBoundingClientRect().bottom > top);
      return { blockId: block?.dataset["blockId"] ?? "", line: block?.dataset["line"] ?? "" };
    };
    const startedAt = performance.now();
    let changed = false;
    let final = read();
    while (performance.now() - startedAt < 750) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      final = read();
      changed ||= final.blockId !== expectedPosition.blockId ||
        final.line !== expectedPosition.line;
    }
    return { changed, final };
  }, expected);
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
    const before = await heading.textContent();
    await page.evaluate(() => performance.clearMeasures("preview-latency"));
    await page.keyboard.type(String.fromCharCode(97 + (index % 26)));
    await expect.poll(() => heading.textContent(), { timeout: 10_000 }).not.toBe(before);
    const durations = await page.evaluate(() =>
      performance.getEntriesByName("preview-latency", "measure").map((entry) => entry.duration));
    samples.push(durations.at(-1) ?? Infinity);
  }
  samples.sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
  console.log(`${transition} input distribution: p95 ${p95.toFixed(2)} ms`);
  expect(p95).toBeLessThan(100);
}

test("AC-R2-01: the View menu switches all pane modes", async () => {
  const { application, page } = await launchEditor(largeFixturePath);
  try {
    const editor = page.getByTestId("editor");
    const preview = page.getByTestId("preview");
    await editor.locator(".cm-content").click();
    await page.keyboard.press(DOCUMENT_END);
    await preview.evaluate((element) => { element.scrollTop = 120; });
    const text = await editor.locator(".cm-content").textContent();
    const activeLine = await editor.locator(".cm-activeLine").textContent();
    const editorScroll = await editor.locator(".cm-scroller")
      .evaluate((element) => element.scrollTop);
    const previewScroll = await preview.evaluate((element) => element.scrollTop);

    await clickMenuItem(application, "view-editor");
    await expect(editor).toBeVisible();
    await expect(preview).toBeHidden();
    await clickMenuItem(application, "view-preview");
    await expect(editor).toBeHidden();
    await expect(preview).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+1" : "Control+1");

    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(editor.locator(".cm-content")).toHaveText(text ?? "");
    await expect(editor.locator(".cm-activeLine")).toHaveText(activeLine ?? "");
    expect(await editor.locator(".cm-scroller").evaluate((element) => element.scrollTop))
      .toBe(editorScroll);
    expect(await preview.evaluate((element) => element.scrollTop)).toBe(previewScroll);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-02: the divider persists and resets", async () => {
  const first = await launchEditor(fixturePath);
  let restarted: Awaited<ReturnType<typeof launchEditor>> | null = null;
  try {
    const workspace = first.page.locator("#workspace");
    const divider = first.page.getByTestId("divider");
    const bounds = await workspace.boundingBox();
    const sidebar = await first.page.locator("#workspace-sidebar").boundingBox();
    if (bounds === null || sidebar === null) throw new Error("Workspace has no bounds");
    const target = sidebar.x + sidebar.width + (bounds.width - sidebar.width) * 0.3;
    await divider.hover();
    await first.page.mouse.down();
    await first.page.mouse.move(target, bounds.y + 100);
    await first.page.mouse.up();

    await expect.poll(() => workspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("30%");
    const placed = await divider.boundingBox();
    if (placed === null) throw new Error("Divider has no bounds");
    expect(Math.abs(placed.x + placed.width / 2 - target)).toBeLessThan(5);
    const pane = bounds.width - sidebar.width;
    const dragged = await first.page.getByTestId("editor").boundingBox();
    if (dragged === null) throw new Error("Editor has no bounds");
    expect(Math.abs(dragged.width - pane * 0.3)).toBeLessThan(8);
    await first.application.close();
    restarted = await launchEditor(fixturePath, first.userDataDir);
    const restoredWorkspace = restarted.page.locator("#workspace");
    const restoredDivider = restarted.page.getByTestId("divider");
    await expect.poll(() => restoredWorkspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("30%");
    await restoredDivider.dblclick();
    await expect.poll(() => restoredWorkspace.evaluate((element) =>
      element.style.getPropertyValue("--editor-share"))).toBe("50%");
  } finally {
    if (restarted === null) {
      await first.application.close().catch(() => undefined);
      await removeProfileDirectory(first.userDataDir);
    } else {
      await closeEditor(restarted.application, restarted.page);
    }
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

test("AC-R2-04: focus mode hides chrome and Escape restores each view mode", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    const modes = ["view-split", "view-editor", "view-preview"] as const;
    for (const mode of modes) {
      await clickMenuItem(application, mode);
      const priorMode = await page.locator("#workspace").getAttribute("data-view-mode");
      await page.locator("#workspace").click({ position: { x: 500, y: 100 } });
      await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+F`);
      await expect(page.getByTestId("tabs")).toBeHidden();
      await expect(page.getByRole("complementary", { name: "Workspace" })).toBeHidden();
      await expect(page.getByTestId("status")).toBeHidden();
      await expect.poll(() => nativeFullScreen(application)).toBe(true);

      await page.keyboard.press("Escape");

      await expect.poll(() => nativeFullScreen(application)).toBe(false);
      await expect(page.getByTestId("tabs")).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Workspace" })).toBeVisible();
      await expect(page.getByTestId("status")).toBeVisible();
      await expect(page.locator("#workspace")).toHaveAttribute("data-view-mode", priorMode ?? "");
    }
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-05: continuous resize preserves the preview block and frame budget", async () => {
  test.setTimeout(60_000);
  const { application, page } = await launchEditor(resizeFixturePath);
  try {
    const preview = page.getByTestId("preview");
    await expect.poll(() => preview.getAttribute("data-render-complete"), {
      timeout: 30_000,
    }).toBe("true");
    await preview.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
    const topBlock = await previewPosition(preview);
    const [measurements] = await Promise.all([
      page.evaluate(async () => {
        const frames: number[] = [];
        const longTaskStarts: number[] = [];
        const observer = new PerformanceObserver((list) => {
          longTaskStarts.push(...list.getEntries().map((entry) => entry.startTime));
        });
        observer.observe({ type: "longtask" });
        const windowStart = performance.now();
        let previous = windowStart;
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
        return {
          frames: frames.sort((left, right) => left - right),
          longTasks: longTaskStarts.filter((start) =>
            start >= windowStart && start <= windowEnd).length,
        };
      }),
      application.evaluate(async ({ BrowserWindow }) => {
        const editorWindow = BrowserWindow.getAllWindows()[0];
        await new Promise<void>((resolve) => {
          let count = 0;
          const timer = setInterval(() => {
            editorWindow?.setSize(count % 2 === 0 ? 1_100 : 1_200, 800);
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
    console.log(`resize frame distribution: p95 ${p95.toFixed(2)} ms`);
    expect(p95).toBeLessThanOrEqual(32);
    expect(measurements.longTasks).toBe(0);
    const settled = await positionDuringResizeSettle(preview, topBlock);
    expect(settled.changed).toBe(false);
    expect(settled.final).toEqual(topBlock);
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-R2-06: full screen and focus transitions keep input below 100 milliseconds", async () => {
  test.setTimeout(60_000);
  const { application, page } = await launchEditor(resizeFixturePath);
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

test("AC-R2-08: view modes add no toolbar row", async () => {
  const { application, page } = await launchEditor(fixturePath);
  try {
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById("view-editor")))).toBe(true);
    await expect(page.locator("body > #tabs + #workspace")).toHaveCount(1);
    await expect(page.locator("[role=toolbar]")).toHaveCount(0);
  } finally {
    await closeEditor(application, page);
  }
});
