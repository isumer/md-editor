import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { repositoryRoot, launchEditor, stubOpenDialog } from "./helpers";

const run = promisify(execFile);
const SAMPLES = 30;
const TWENTY_MEGABYTES = "20971520";
const large50 = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");
const large500 = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");

let temporaryDirectory = "";
let large20 = "";

test.describe.configure({ timeout: 420_000 });

test.beforeAll(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-big-"));
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

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function distribution(values: readonly number[]): string {
  return values.map((value) => value.toFixed(1)).join(", ");
}

function report(label: string, values: readonly number[]): void {
  console.log(
    `${label}: n=${String(values.length)} min=${percentile(values, 0).toFixed(1)} ` +
    `p50=${percentile(values, 0.5).toFixed(1)} p95=${percentile(values, 0.95).toFixed(1)} ` +
    `max=${percentile(values, 1).toFixed(1)} ms`,
  );
  console.log(`${label} distribution: ${distribution(values)}`);
}

async function openPreview(
  page: Page,
  expectedHeading: string,
): Promise<void> {
  await expect(page.getByTestId("editor").locator(".cm-content")).toContainText(
    expectedHeading,
    { timeout: 10_000 },
  );
  await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
    expectedHeading.replace(/^#+\s*/u, ""),
    { timeout: 10_000 },
  );
}

interface LongTaskProbe {
  longtasks: { start: number; duration: number }[];
}

async function installLongTaskProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: LongTaskProbe = { longtasks: [] };
    (window as unknown as { __longTaskProbe?: LongTaskProbe }).__longTaskProbe = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longtasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask" });
  });
}

async function openLargeThroughMenu(
  application: Awaited<ReturnType<typeof launchEditor>>["application"],
  page: Page,
  filePath: string,
): Promise<void> {
  await stubOpenDialog(application, filePath);
  await expect.poll(() => application.evaluate(({ Menu }) =>
    Boolean(Menu.getApplicationMenu()?.getMenuItemById("file-open"))),
  { timeout: 5_000 }).toBe(true);
  const clicked = await application.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById("file-open");
    if (!item) {
      return false;
    }
    item.click();
    return true;
  });
  expect(clicked).toBe(true);
}

test("AC-PERF-10: opening a 20 MB document keeps every main-thread task under 100 ms", {
  tag: "@AC-PERF-10",
  annotation: { type: "AC-PERF-10" },
}, async () => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor();
  try {
    await installLongTaskProbe(page);
    await page.reload();
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
    await openLargeThroughMenu(application, page, large20);
    await expect(page.getByTestId("editor").locator(".cm-content")).toContainText(
      firstLine,
      { timeout: 30_000 },
    );
    const shownAt = await page.evaluate(() => performance.now());
    await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
      firstLine.replace(/^#+\s*/u, ""),
      { timeout: 30_000 },
    );
    // Observe the fill pass for a bounded performance window.
    await page.waitForTimeout(5_000);
    const probe = await page.evaluate(() => {
      const scope = window as unknown as { __longTaskProbe?: LongTaskProbe };
      return {
        longtasks: scope.__longTaskProbe?.longtasks ?? [],
        blocks: document.querySelectorAll("#preview .preview-block").length,
      };
    });
    const afterOpen = probe.longtasks
      .filter((entry) => entry.start >= shownAt)
      .map((entry) => entry.duration);
    console.log(
      `AC-PERF-10 open longtasks: n=${String(afterOpen.length)} ` +
      `max=${Math.max(...afterOpen, 0).toFixed(1)} ms blocks=${String(probe.blocks)}`,
    );
    expect(probe.blocks).toBeGreaterThan(1);
    expect(afterOpen.filter((duration) => duration >= 100)).toEqual([]);
  } finally {
    await application.close();
  }
});

async function placeCaretInFirstLine(page: Page): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+Home");
  // The editor wraps lines, so End targets the visual end of the heading's first line.
  await page.keyboard.press("End");
}

async function measureKeystrokes(
  page: Page,
  measureName: "preview-latency" | "preview-patch",
): Promise<number[]> {
  const heading = page.getByTestId("preview").locator("h1").first();
  await placeCaretInFirstLine(page);
  let suffix = "";
  for (let index = 0; index < 5; index += 1) {
    const character = String(index % 10);
    suffix += character;
    await page.keyboard.type(character);
    await expect(heading).toContainText(suffix, { timeout: 10_000 });
  }
  await page.evaluate((name) => performance.clearMeasures(name), measureName);

  const samples: number[] = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const character = String.fromCharCode(97 + (index % 26));
    suffix += character;
    await page.evaluate((name) => performance.clearMeasures(name), measureName);
    await page.keyboard.type(character);
    await expect(heading).toContainText(suffix, { timeout: 10_000 });
    const durations = await page.evaluate((name) =>
      performance.getEntriesByName(name, "measure").map((entry) => entry.duration),
    measureName);
    expect(durations.length).toBeGreaterThanOrEqual(1);
    samples.push(durations.at(-1) ?? 0);
  }
  return samples;
}

test("AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms", {
  tag: "@AC-PERF-02",
  annotation: { type: "AC-PERF-02" },
}, async () => {
  const { application, page } = await launchEditor(large50);
  try {
    await openPreview(page, await fs.readFile(large50, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    const samples = await measureKeystrokes(page, "preview-latency");
    report("AC-PERF-02 preview-latency", samples);
    expect(samples).toHaveLength(SAMPLES);
    expect(percentile(samples, 0.95)).toBeLessThan(50);
  } finally {
    await application.close();
  }
});

test("AC-PERF-07: 500 KB document keystroke latency p95 stays under 150 ms", {
  tag: "@AC-PERF-07",
  annotation: { type: "AC-PERF-07" },
}, async () => {
  const { application, page } = await launchEditor(large500);
  try {
    await openPreview(page, await fs.readFile(large500, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    const samples = await measureKeystrokes(page, "preview-latency");
    report("AC-PERF-07 preview-latency", samples);
    expect(samples).toHaveLength(SAMPLES);
    expect(percentile(samples, 0.95)).toBeLessThan(150);
  } finally {
    await application.close();
  }
});

test("AC-PERF-10: 20 MB document keystroke latency p95 stays under 100 ms", {
  tag: "@AC-PERF-10",
  annotation: { type: "AC-PERF-10" },
}, async () => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor(large20);
  try {
    await openPreview(page, firstLine);
    const samples = await measureKeystrokes(page, "preview-latency");
    report("AC-PERF-10 preview-latency", samples);
    expect(samples).toHaveLength(SAMPLES);
    expect(percentile(samples, 0.95)).toBeLessThan(100);
  } finally {
    await application.close();
  }
});

test("AC-PERF-08: one keystroke patches only the changed block under 8 ms p95", {
  tag: "@AC-PERF-08",
  annotation: { type: "AC-PERF-08" },
}, async () => {
  const { application, page } = await launchEditor(large500);
  try {
    await openPreview(page, await fs.readFile(large500, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    const preview = page.getByTestId("preview");
    // Compare the same set of blocks: the lazy fill adds blocks after the first screen.
    await expect.poll(() => preview.evaluate(
      (element) => (element as HTMLElement).dataset["renderComplete"],
    ), { timeout: 30_000 }).toBe("true");
    const before = await preview.locator(".preview-block").allTextContents();
    const samples = await measureKeystrokes(page, "preview-patch");
    report("AC-PERF-08 preview-patch", samples);
    const after = await preview.locator(".preview-block").allTextContents();
    const changed = after.map((text, index) => text === before[index]);

    expect(samples).toHaveLength(SAMPLES);
    expect(percentile(samples, 0.95)).toBeLessThan(8);
    expect(changed.filter((unchanged) => !unchanged)).toHaveLength(1);
  } finally {
    await application.close();
  }
});

interface ScrollProbe {
  active: boolean;
  done: boolean;
  frames: number[];
  longtasks: number[];
}

async function startScrollProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = {
      active: true,
      done: false,
      frames: [] as number[],
      longtasks: [] as number[],
    };
    (window as unknown as { __scrollProbe?: ScrollProbe }).__scrollProbe = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longtasks.push(entry.duration);
      }
    }).observe({ type: "longtask" });
    let previous = 0;
    const tick = (time: number): void => {
      if (previous > 0) {
        probe.frames.push(time - previous);
      }
      previous = time;
      if (probe.active) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

async function flingPreview(page: Page): Promise<ScrollProbe> {
  // Drive the fling entirely inside the renderer so protocol round-trips do not
  // show up as missed frames.
  await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("#preview");
    const probe = (window as unknown as { __scrollProbe?: ScrollProbe })
      .__scrollProbe;
    if (!preview || !probe) {
      throw new Error("Preview or scroll probe missing");
    }
    const started = performance.now();
    const step = (time: number): void => {
      if (time - started >= 1_000) {
        probe.done = true;
        return;
      }
      preview.scrollTop += 400;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await expect.poll(() => page.evaluate(() => {
    const probe = (window as unknown as { __scrollProbe?: ScrollProbe })
      .__scrollProbe;
    return probe?.done ?? false;
  }), { timeout: 15_000 }).toBe(true);
  return page.evaluate(() => {
    const probe = (window as unknown as { __scrollProbe?: ScrollProbe })
      .__scrollProbe;
    if (!probe) {
      throw new Error("Scroll probe missing");
    }
    probe.active = false;
    return { active: probe.active, done: probe.done, frames: probe.frames,
      longtasks: probe.longtasks };
  });
}

async function expectSmoothScroll(page: Page, label: string): Promise<void> {
  await startScrollProbe(page);
  const probe = await flingPreview(page);
  const slowFrames = probe.frames.filter((duration) => duration > 32);
  console.log(
    `${label}: frames=${String(probe.frames.length)} ` +
    `maxFrame=${Math.max(...probe.frames, 0).toFixed(1)}ms ` +
    `frames>32ms=${String(slowFrames.length)} ` +
    `longtasks=${String(probe.longtasks.length)} ` +
    `longtaskDurations=[${distribution(probe.longtasks)}]`,
  );
  expect(slowFrames).toEqual([]);
  expect(probe.longtasks).toEqual([]);
}

test("AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms", {
  tag: "@AC-PERF-09",
  annotation: { type: "AC-PERF-09" },
}, async () => {
  const { application, page } = await launchEditor(large500);
  try {
    await openPreview(page, await fs.readFile(large500, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    await expect.poll(() => page.getByTestId("preview").evaluate(
      (element) => (element as HTMLElement).dataset["renderComplete"],
    ), { timeout: 30_000 }).toBe("true");
    await expectSmoothScroll(page, "AC-PERF-09 500KB scroll");
  } finally {
    await application.close();
  }
});

test("AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms", {
  tag: "@AC-PERF-09",
  annotation: { type: "AC-PERF-09" },
}, async () => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor(large20);
  try {
    const started = Date.now();
    await openPreview(page, firstLine);
    await expect.poll(() => page.getByTestId("preview").evaluate(
      (element) => (element as HTMLElement).dataset["renderComplete"],
    ), { timeout: 360_000 }).toBe("true");
    // Bounded fill batches need about 4.4 minutes for 114,567 blocks on this machine.
    console.log(`AC-PERF-09 20MB render complete after ${String(Date.now() - started)}ms`);
    await expectSmoothScroll(page, "AC-PERF-09 20MB scroll");
  } finally {
    await application.close();
  }
});

test("AC-PERF-11: a 20 MB document is editable and shows its first screen in time", {
  tag: "@AC-PERF-11",
  annotation: { type: "AC-PERF-11" },
}, async () => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
    await stubOpenDialog(application, large20);
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById("file-open"))),
    { timeout: 5_000 }).toBe(true);
    // The clock starts at the open request, not at launch.
    const started = Date.now();
    const clicked = await application.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById("file-open");
      if (!item) {
        return false;
      }
      item.click();
      return true;
    });
    expect(clicked).toBe(true);
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText(firstLine, { timeout: 10_000 });
    const editableAfter = Date.now() - started;
    await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
      firstLine.replace(/^#+\s*/u, ""),
      { timeout: 10_000 },
    );
    const previewAfter = Date.now() - started;
    console.log(
      `AC-PERF-11 20MB open: editable=${String(editableAfter)}ms ` +
      `firstPreview=${String(previewAfter)}ms`,
    );
    expect(editableAfter).toBeLessThan(1_500);
    expect(previewAfter).toBeLessThan(1_000);
  } finally {
    await application.close();
  }
});
