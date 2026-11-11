import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

import {
  closeEditor,
  DOCUMENT_START,
  repositoryRoot,
  launchEditor,
  stubOpenDialog,
} from "./helpers";
import {
  runPerfTrace,
  startPerfTrace,
  startPerfTraceWithSession,
  summarizePerfTrace,
} from "./perf-trace";

const run = promisify(execFile);
const SAMPLES = 30;
const TWENTY_MEGABYTES = "20971520";
const large50 = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");
const large500 = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");

let temporaryDirectory = "";
let large20 = "";

test.describe.configure({ timeout: 420_000 });

test.beforeAll(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-big-"));
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

function syntheticTraceEvents(): Record<string, string | number>[] {
  const complete = (name: string, ts: number, dur: number, cat = "") =>
    ({ name, ts, dur, cat, ph: "X", pid: 1, tid: 2 });
  return [
    complete("perf-diagnostic-window-start", 100_000, 0),
    complete("RunTask", 120_000, 80_000),
    complete("RunTask", 250_000, 120_000),
    complete("RunTask", 400_000, 60_000),
    complete("RunTask", 480_000, 55_000),
    complete("V8.GCScavenger", 240_000, 30_000, "v8.gc"),
    complete("V8.GCCompactor", 260_000, 20_000, "v8.gc"),
    complete("FunctionCall", 260_000, 40_000),
    complete("EvaluateScript", 280_000, 30_000),
    complete("UpdateLayoutTree", 320_000, 20_000),
    complete("RecalculateStyles", 335_000, 20_000),
    complete("Layout", 350_000, 30_000),
    complete("Paint", 245_000, 20_000),
    complete("perf-diagnostic-window-end", 600_000, 0),
  ];
}

test("trace summary reports the exact three longest tasks", () => {
  expect(summarizePerfTrace("synthetic", syntheticTraceEvents())).toBe(
    "synthetic trace: longtasks=[start=150.0ms duration=120.0ms gc=30.0ms " +
    "script=50.0ms style=35.0ms layout=20.0ms paint=15.0ms; " +
    "start=20.0ms duration=80.0ms gc=0.0ms script=0.0ms style=0.0ms " +
    "layout=0.0ms paint=0.0ms; start=300.0ms duration=60.0ms gc=0.0ms " +
    "script=0.0ms style=0.0ms layout=0.0ms paint=0.0ms]",
  );
});

interface FakeTraceSession {
  emit(events: readonly unknown[]): void;
  mark(name: string): Promise<number>;
  session: CDPSession;
  starts: unknown[];
}

function fakeTraceSession(): FakeTraceSession {
  let completeListener: ((payload: { stream: string }) => void) | undefined;
  let dataListener: ((payload: { value: unknown[] }) => void) | undefined;
  let timestamp = 100_000;
  const starts: unknown[] = [];
  const fake = {
    detach: async () => undefined,
    on: (_event: string, listener: (payload: { value: unknown[] }) => void) => {
      dataListener = listener;
      return fake;
    },
    once: (_event: string, listener: (payload: { stream: string }) => void) => {
      completeListener = listener;
      return fake;
    },
    send: async (method: string, parameters?: unknown) => {
      if (method === "Tracing.start") starts.push(parameters);
      if (method === "Tracing.end") completeListener?.({ stream: "trace-stream" });
      return {};
    },
  };
  const emit = (events: readonly unknown[]): void => {
    dataListener?.({ value: [...events] });
  };
  return {
    emit,
    mark: async (name) => {
      emit([{ name, ts: timestamp, dur: 0, cat: "blink.user_timing",
        ph: "X", pid: 1, tid: 2 }]);
      timestamp += 100_000;
      return timestamp / 1_000;
    },
    session: fake as unknown as CDPSession,
    starts,
  };
}

test("trace starts CDP with the required categories and collects events", async () => {
  const source = fakeTraceSession();
  const trace = await startPerfTraceWithSession(source.session, source.mark);
  await trace.markStart();
  source.emit([{ name: "RunTask", ts: 120_000, dur: 60_000, cat: "toplevel",
    ph: "X", pid: 1, tid: 2 }]);
  const result = await trace.stop();

  expect(source.starts).toEqual([{
    categories: "devtools.timeline,disabled-by-default-devtools.timeline," +
      "v8,v8.gc,blink.user_timing",
    options: "record-until-full",
    transferMode: "ReportEvents",
  }]);
  expect(result.summary("captured")).toContain("duration=60.0ms");
});

test("a failed traced window writes its trace events", async ({}, testInfo) => {
  const source = fakeTraceSession();
  const trace = await startPerfTraceWithSession(source.session, source.mark);
  const failurePath = testInfo.outputPath("failed-trace.json");
  await trace.markStart();

  await expect(runPerfTrace(trace, "failed", failurePath, async (finish) => {
    source.emit([{ name: "RunTask", ts: 120_000, dur: 60_000, cat: "toplevel",
      ph: "X", pid: 1, tid: 2 }]);
    await finish();
    throw new Error("forced failure");
  })).rejects.toThrow("forced failure");

  const saved: unknown = JSON.parse(await fs.readFile(failurePath, "utf8"));
  expect(saved).toEqual({ traceEvents: expect.arrayContaining([
    expect.objectContaining({ name: "RunTask" }),
  ]) });
});

test("a successful traced window does not write a failure trace", async ({}, testInfo) => {
  const source = fakeTraceSession();
  const trace = await startPerfTraceWithSession(source.session, source.mark);
  const failurePath = testInfo.outputPath("successful-trace.json");
  await trace.markStart();

  await runPerfTrace(trace, "successful", failurePath, async (finish) => {
    await finish();
  });

  await expect(fs.access(failurePath)).rejects.toThrow();
});

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
  marks: { name: string; start: number }[];
  frames: LongAnimationFrame[];
}

interface LongAnimationFrame {
  start: number;
  duration: number;
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: LongAnimationScript[];
}

interface LongAnimationScript {
  duration: number;
  forcedStyleAndLayoutDuration: number;
  invoker: string;
  sourceFunctionName: string;
  sourceURL: string;
}

async function installLongTaskProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: LongTaskProbe = { longtasks: [], marks: [], frames: [] };
    (window as unknown as { __longTaskProbe?: LongTaskProbe }).__longTaskProbe = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "longtask") {
          probe.longtasks.push({ start: entry.startTime, duration: entry.duration });
        } else if (entry.entryType === "mark") {
          probe.marks.push({ name: entry.name, start: entry.startTime });
        } else if (entry.entryType === "long-animation-frame") {
          const frame = entry as PerformanceEntry & {
            blockingDuration: number;
            renderStart: number;
            styleAndLayoutStart: number;
            scripts: LongAnimationScript[];
          };
          probe.frames.push({
            start: frame.startTime,
            duration: frame.duration,
            blockingDuration: frame.blockingDuration,
            renderStart: frame.renderStart,
            styleAndLayoutStart: frame.styleAndLayoutStart,
            scripts: frame.scripts.map((script) => ({
              duration: script.duration,
              forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
              invoker: script.invoker,
              sourceFunctionName: script.sourceFunctionName,
              sourceURL: script.sourceURL,
            })),
          });
        }
      }
    }).observe({ entryTypes: ["longtask", "mark", "long-animation-frame"] });
  });
}

function frameDiagnostics(
  task: { start: number; duration: number },
  frames: readonly LongAnimationFrame[],
): string {
  const taskEnd = task.start + task.duration;
  const overlapping = frames.filter((frame) =>
    frame.start < taskEnd && frame.start + frame.duration > task.start);
  return overlapping.map((frame) => {
    const renderDelay = frame.renderStart > 0
      ? frame.renderStart - frame.start
      : frame.duration;
    const preLayout = frame.styleAndLayoutStart > 0
      ? frame.styleAndLayoutStart - frame.renderStart
      : 0;
    const styleLayoutPaint = frame.styleAndLayoutStart > 0
      ? frame.start + frame.duration - frame.styleAndLayoutStart
      : 0;
    const scripts = frame.scripts.map((script) => {
      const source = script.sourceURL.split("/").at(-1) ?? script.sourceURL;
      return `${script.sourceFunctionName || script.invoker || "anonymous"} ` +
        `${script.duration.toFixed(1)} ms forcedStyle=` +
        `${script.forcedStyleAndLayoutDuration.toFixed(1)} ms source=${source}`;
    }).join("; ");
    return `start ${frame.start.toFixed(1)} ms duration ${frame.duration.toFixed(1)} ms ` +
      `blocking=${frame.blockingDuration.toFixed(1)} ms ` +
      `renderDelay=${renderDelay.toFixed(1)} ms ` +
      `preLayout=${preLayout.toFixed(1)} ms ` +
      `styleLayoutPaint=${styleLayoutPaint.toFixed(1)} ms scripts=[${scripts}]`;
  }).join("; ");
}

function openTaskDiagnostics(
  tasks: readonly { start: number; duration: number }[],
  marks: readonly { name: string; start: number }[],
  frames: readonly LongAnimationFrame[],
): string {
  const largest = tasks.reduce<typeof tasks[number] | undefined>(
    (current, task) => current === undefined || task.duration > current.duration
      ? task
      : current,
    undefined,
  );
  if (largest === undefined) {
    return "largest=none marks=[] frames=[]";
  }
  const taskEnd = largest.start + largest.duration;
  const nearby = marks.filter((mark) =>
    mark.start >= largest.start - 50 && mark.start <= taskEnd + 50);
  const markSummary = nearby.map((mark) =>
    `${mark.name}@${mark.start.toFixed(1)}`).join(", ");
  return `largest=start ${largest.start.toFixed(1)} ms duration ` +
    `${largest.duration.toFixed(1)} ms marks=[${markSummary}] ` +
    `frames=[${frameDiagnostics(largest, frames)}]`;
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
}, async ({}, testInfo) => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor();
  try {
    await installLongTaskProbe(page);
    await page.reload();
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
    const trace = await startPerfTrace(page);
    await runPerfTrace(
      trace,
      "AC-PERF-10 open",
      testInfo.outputPath("ac-perf-10-trace.json"),
      async (finish) => {
        await openLargeThroughMenu(application, page, large20);
        await expect(page.getByTestId("editor").locator(".cm-content")).toContainText(
          firstLine,
          { timeout: 30_000 },
        );
        const shownAt = await trace.markStart();
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
            marks: scope.__longTaskProbe?.marks ?? [],
            frames: scope.__longTaskProbe?.frames ?? [],
            blocks: document.querySelectorAll("#preview .preview-block").length,
          };
        });
        await finish();
        const afterOpen = probe.longtasks
          .filter((entry) => entry.start >= shownAt);
        const diagnostics = openTaskDiagnostics(afterOpen, probe.marks, probe.frames);
        console.log(
          `AC-PERF-10 open longtasks: n=${String(afterOpen.length)} ` +
          `max=${Math.max(...afterOpen.map((entry) => entry.duration), 0).toFixed(1)} ms ` +
          `blocks=${String(probe.blocks)} ${diagnostics}`,
        );
        expect(probe.blocks).toBeGreaterThan(1);
        expect(
          afterOpen.filter((entry) => entry.duration >= 100),
          `AC-PERF-10 open task failed. ${diagnostics}`,
        ).toEqual([]);
      },
    );
  } finally {
    await closeEditor(application, page);
  }
});

async function placeCaretInFirstLine(page: Page): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press(DOCUMENT_START);
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
    await closeEditor(application, page);
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
    await closeEditor(application, page);
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
    await closeEditor(application, page);
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
    await closeEditor(application, page);
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

// See docs/acceptance/PERF-response-time.md: macOS waits for a real-Mac measurement.
const AC_PERF_09_MAC_SKIP = "AC-PERF-09 is skipped on the macOS CI VM until a real-Mac measurement (PR #9)";

test("AC-PERF-09: fling-scrolling the 500 KB preview has no frame over 32 ms", {
  tag: "@AC-PERF-09",
  annotation: { type: "AC-PERF-09" },
}, async () => {
  test.skip(process.platform === "darwin", AC_PERF_09_MAC_SKIP);
  const { application, page } = await launchEditor(large500);
  try {
    await openPreview(page, await fs.readFile(large500, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    await expect.poll(() => page.getByTestId("preview").evaluate(
      (element) => (element as HTMLElement).dataset["renderComplete"],
    ), { timeout: 30_000 }).toBe("true");
    await expectSmoothScroll(page, "AC-PERF-09 500KB scroll");
  } finally {
    await closeEditor(application, page);
  }
});

test("AC-PERF-09: fling-scrolling the 20 MB preview has no frame over 32 ms", {
  tag: "@AC-PERF-09",
  annotation: { type: "AC-PERF-09" },
}, async () => {
  test.skip(process.platform === "darwin", AC_PERF_09_MAC_SKIP);
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
    await closeEditor(application, page);
  }
});

test("AC-PERF-11: a 20 MB document is editable and shows its first screen in time", {
  tag: "@AC-PERF-11",
  annotation: { type: "AC-PERF-11" },
}, async ({}, testInfo) => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
    await stubOpenDialog(application, large20);
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById("file-open"))),
    { timeout: 5_000 }).toBe(true);
    const trace = await startPerfTrace(page);
    let editableAfter = 0;
    let previewAfter = 0;
    await runPerfTrace(
      trace,
      "AC-PERF-11",
      testInfo.outputPath("ac-perf-11-trace.json"),
      async (finish) => {
        // The clock starts at the open request, not at launch.
        await trace.markStart();
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
        editableAfter = Date.now() - started;
        await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
          firstLine.replace(/^#+\s*/u, ""),
          { timeout: 10_000 },
        );
        previewAfter = Date.now() - started;
        await finish();
        console.log(
          `AC-PERF-11 20MB open: editable=${String(editableAfter)}ms ` +
          `firstPreview=${String(previewAfter)}ms`,
        );
        expect(editableAfter).toBeLessThan(1_500);
        expect(previewAfter).toBeLessThan(1_000);
      },
    );
  } finally {
    await closeEditor(application, page);
  }
});
