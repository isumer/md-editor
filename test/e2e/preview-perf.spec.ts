/* eslint-disable max-lines -- Performance criteria share one generated fixture and reporting helpers. */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import {
  closeEditor,
  DOCUMENT_START,
  repositoryRoot,
  launchEditor,
  stubOpenDialog,
} from "./helpers";

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

interface KeystrokeProbe {
  renders: { id: number; start: number }[];
  responses: { id: number; start: number }[];
  longtasks: { start: number; duration: number }[];
  frames: LongAnimationFrame[];
}

interface MacProcess {
  pid: number;
  parentPid: number;
  cpu: number;
  memory: number;
  state: string;
  command: string;
}

let previousMacProcesses: MacProcess[] = [];

function processLine(line: string): MacProcess | null {
  const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.+)$/u.exec(line);
  if (match === null) {
    return null;
  }
  const [, pid = "", parentPid = "", cpu = "", memory = "", state = "", command = ""] = match;
  return {
    pid: Number(pid),
    parentPid: Number(parentPid),
    cpu: Number(cpu),
    memory: Number(memory),
    state,
    command,
  };
}

async function macProcesses(): Promise<MacProcess[]> {
  if (process.platform !== "darwin") {
    return [];
  }
  const { stdout } = await run("ps", [
    "-axo", "pid=,ppid=,%cpu=,%mem=,state=,comm=",
  ]);
  return stdout.split("\n").map(processLine).filter(
    (process): process is MacProcess => process !== null,
  );
}

async function rememberMacProcessTree(rootPid: number | undefined): Promise<void> {
  if (rootPid === undefined || process.platform !== "darwin") {
    return;
  }
  const processes = await macProcesses();
  const processIds = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of processes) {
      if (processIds.has(candidate.parentPid) && !processIds.has(candidate.pid)) {
        processIds.add(candidate.pid);
        changed = true;
      }
    }
  }
  previousMacProcesses = processes.filter((candidate) => processIds.has(candidate.pid));
}

async function reportMacProcessLoad(): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }
  const current = await macProcesses();
  const previousByPid = new Map(previousMacProcesses.map((entry) => [entry.pid, entry]));
  const survivors = current.filter((entry) =>
    previousByPid.get(entry.pid)?.command === entry.command);
  const summary = survivors.map((entry) =>
    `${String(entry.pid)}:${entry.command} cpu=${entry.cpu.toFixed(1)}% ` +
    `mem=${entry.memory.toFixed(1)}% state=${entry.state}`).join("; ");
  console.log(
    `AC-PERF-02 macOS start: previous=${String(previousMacProcesses.length)} ` +
    `survivors=${String(survivors.length)} load=${os.loadavg().map((load) =>
      load.toFixed(2)).join(",")} cores=${String(os.cpus().length)} ` +
    `processes=[${summary}]`,
  );
}

// Runs on the live page through launchEditor's onPage hook, before the argv
// document applies, so no reload is needed on the shipped open path.
async function installKeystrokeProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe: KeystrokeProbe = { renders: [], responses: [], longtasks: [], frames: [] };
    (window as unknown as { __keystrokeProbe?: KeystrokeProbe }).__keystrokeProbe = probe;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, argumentsList) {
        const worker = Reflect.construct(Target, argumentsList) as Worker;
        const nativePostMessage = worker.postMessage;
        worker.postMessage = new Proxy(nativePostMessage, {
          apply(postMessage, receiver, messageArguments) {
            const message = messageArguments[0] as { id?: unknown; op?: unknown } | undefined;
            if (message?.op === "render" && typeof message.id === "number") {
              probe.renders.push({ id: message.id, start: performance.now() });
            }
            return Reflect.apply(postMessage, receiver, messageArguments) as void;
          },
        });
        worker.addEventListener("message", (event: MessageEvent<unknown>) => {
          const message = event.data as { id?: unknown; op?: unknown } | null;
          if (message !== null && typeof message === "object" &&
            message.op !== "pong" && typeof message.id === "number") {
            probe.responses.push({ id: message.id, start: performance.now() });
          }
        });
        return worker;
      },
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "longtask") {
          probe.longtasks.push({ start: entry.startTime, duration: entry.duration });
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
    }).observe({ entryTypes: ["longtask", "long-animation-frame"] });
  });
}

function beginLongTaskProbe(): void {
  const probe: LongTaskProbe = { longtasks: [], marks: [], frames: [] };
  (window as unknown as { __longTaskProbe?: LongTaskProbe }).__longTaskProbe = probe;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "longtask") {
        probe.longtasks.push({ start: entry.startTime, duration: entry.duration });
      } else if (entry.entryType === "mark") {
        probe.marks.push({ name: entry.name, start: entry.startTime });
      } else if (entry.entryType === "long-animation-frame") {
        const frame = entry as PerformanceEntry & LongAnimationFrame;
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
}

async function startLongTaskProbe(page: Page): Promise<void> {
  await page.evaluate(beginLongTaskProbe);
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

function phaseDuration(
  marks: readonly { name: string; start: number }[],
  startName: string,
  endName: string,
): number | undefined {
  const start = marks.find((mark) => mark.name === startName)?.start;
  const end = marks.find((mark) => mark.name === endName)?.start;
  return start === undefined || end === undefined ? undefined : end - start;
}

function phaseSummary(
  marks: readonly { name: string; start: number }[],
): string {
  const phases = [
    ["editable", "open-20mb-start", "open-20mb-editable"],
    ["firstPreview", "open-20mb-start", "open-20mb-first-preview"],
    ["warm", "preview-sanitize-warm-start", "preview-sanitize-warm-end"],
    ["sanitize", "preview-sanitize-start", "preview-sanitize-end"],
    ["rewrite", "preview-rewrite-start", "preview-rewrite-end"],
    ["dom", "preview-dom-start", "preview-dom-end"],
    ["apply", "preview-apply-start", "preview-apply-end"],
  ] as const;
  return phases.map(([label, start, end]) => {
    const duration = phaseDuration(marks, start, end);
    return `${label}=${duration === undefined ? "missing" : duration.toFixed(1)}ms`;
  }).join(" ");
}

function markedFrameDiagnostics(
  marks: readonly { name: string; start: number }[],
  frames: readonly LongAnimationFrame[],
  startName: string,
  endName: string,
): string {
  const start = marks.find((mark) => mark.name === startName)?.start;
  const end = marks.find((mark) => mark.name === endName)?.start;
  if (start === undefined || end === undefined) {
    return "window-missing";
  }
  return frameDiagnostics({ start, duration: end - start }, frames) || "none";
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
    await startLongTaskProbe(page);
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
        marks: scope.__longTaskProbe?.marks ?? [],
        frames: scope.__longTaskProbe?.frames ?? [],
        blocks: document.querySelectorAll("#preview .preview-block").length,
      };
    });
    const afterOpen = probe.longtasks
      .filter((entry) => entry.start >= shownAt);
    const diagnostics = openTaskDiagnostics(afterOpen, probe.marks, probe.frames);
    console.log(
      `AC-PERF-10 open longtasks: n=${String(afterOpen.length)} ` +
      `max=${Math.max(...afterOpen.map((entry) => entry.duration), 0).toFixed(1)} ms ` +
      `blocks=${String(probe.blocks)}`,
    );
    console.log(`AC-PERF-10 open attribution: ${diagnostics}`);
    expect(probe.blocks).toBeGreaterThan(1);
    expect(
      afterOpen.filter((entry) => entry.duration >= 100),
      `AC-PERF-10 open task failed. ${diagnostics}`,
    ).toEqual([]);
  } finally {
    await rememberMacProcessTree(application.process().pid);
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
  diagnoseSlowSamples = false,
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
    if (diagnoseSlowSamples) {
      await resetKeystrokeProbe(page);
    }
    await page.keyboard.type(character);
    await expect(heading).toContainText(suffix, { timeout: 10_000 });
    const durations = await page.evaluate((name) =>
      performance.getEntriesByName(name, "measure").map((entry) => entry.duration),
    measureName);
    expect(durations.length).toBeGreaterThanOrEqual(1);
    const duration = durations.at(-1) ?? 0;
    samples.push(duration);
    if (diagnoseSlowSamples && duration >= 50) {
      await reportSlowKeystroke(page, index + 1);
    }
  }
  return samples;
}

async function resetKeystrokeProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __keystrokeProbe?: KeystrokeProbe })
      .__keystrokeProbe;
    if (probe !== undefined) {
      probe.renders.length = 0;
      probe.responses.length = 0;
      probe.longtasks.length = 0;
      probe.frames.length = 0;
    }
  });
}

async function reportSlowKeystroke(page: Page, sample: number): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  }));
  const timing = await page.evaluate(() => {
    const probe = (window as unknown as { __keystrokeProbe?: KeystrokeProbe })
      .__keystrokeProbe;
    const entry = performance.getEntriesByName("preview-latency", "measure").at(-1);
    const applyStart = performance.getEntriesByName("preview-apply-start", "mark").at(-1);
    const applyEnd = performance.getEntriesByName("preview-apply-end", "mark").at(-1);
    const measure = entry === undefined
      ? undefined
      : { start: entry.startTime, duration: entry.duration };
    return { probe, measure, applyStart: applyStart?.startTime, applyEnd: applyEnd?.startTime };
  });
  if (timing.measure === undefined) {
    return;
  }
  const render = timing.probe?.renders.at(-1);
  const response = timing.probe?.responses.find((entry) => entry.id === render?.id);
  const start = timing.measure.start;
  const end = start + timing.measure.duration;
  const scheduler = render === undefined ? 0 : render.start - start;
  const worker = render === undefined || response === undefined ? 0 : response.start - render.start;
  const apply = timing.applyStart === undefined || timing.applyEnd === undefined
    ? 0
    : timing.applyEnd - timing.applyStart;
  const longtasks = timing.probe?.longtasks.filter((entry) =>
    entry.start < end && entry.start + entry.duration > start) ?? [];
  const frames = timing.probe?.frames.filter((entry) =>
    entry.start < end && entry.start + entry.duration > start) ?? [];
  const known = scheduler + worker + apply;
  console.log(
    `AC-PERF-02 slow sample ${String(sample)}: total=${timing.measure.duration.toFixed(1)}ms ` +
    `scheduler=${scheduler.toFixed(1)}ms worker=${worker.toFixed(1)}ms ` +
    `rendererApply=${apply.toFixed(1)}ms unattributed=${Math.max(0, timing.measure.duration - known).toFixed(1)}ms ` +
    `longtasks=[${distribution(longtasks.map((entry) => entry.duration))}] ` +
    `loaf=[${frameDiagnostics({ start, duration: timing.measure.duration }, frames)}]`,
  );
}

test("AC-PERF-02: 50 KB document keystroke latency p95 stays under 50 ms", {
  tag: "@AC-PERF-02",
  annotation: { type: "AC-PERF-02" },
}, async () => {
  await reportMacProcessLoad();
  let probeInstalled: Promise<void> = Promise.resolve();
  const { application, page } = await launchEditor(large50, {
    // The probe must exist before the argv open creates the render worker.
    onPage: ({ page: startupPage }) => {
      probeInstalled = installKeystrokeProbe(startupPage);
    },
  });
  try {
    // Diagnostics only; the measurement works without the probe.
    await probeInstalled.catch(() => undefined);
    await openPreview(page, await fs.readFile(large50, "utf8").then((text) =>
      text.split("\n")[0] ?? ""));
    const samples = await measureKeystrokes(page, "preview-latency", true);
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
  loafs: LongAnimationFrame[];
  scrollSteps: number[];
}

async function startScrollProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = {
      active: true,
      done: false,
      frames: [] as number[],
      longtasks: [] as number[],
      loafs: [] as LongAnimationFrame[],
      scrollSteps: [] as number[],
    };
    (window as unknown as { __scrollProbe?: ScrollProbe }).__scrollProbe = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longtasks.push(entry.duration);
      }
    }).observe({ type: "longtask" });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const frame = entry as PerformanceEntry & LongAnimationFrame;
        probe.loafs.push({
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
    }).observe({ type: "long-animation-frame" });
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
      const stepStarted = performance.now();
      preview.scrollTop += 400;
      probe.scrollSteps.push(performance.now() - stepStarted);
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
      longtasks: probe.longtasks, loafs: probe.loafs, scrollSteps: probe.scrollSteps };
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
    `longtaskDurations=[${distribution(probe.longtasks)}] ` +
    `maxScrollStep=${Math.max(...probe.scrollSteps, 0).toFixed(1)}ms`,
  );
  console.log(
    `${label} LoAF attribution: ` +
    `${frameDiagnostics({ start: 0, duration: Number.MAX_SAFE_INTEGER }, probe.loafs) || "none"}`,
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
}, async () => {
  const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
  const { application, page } = await launchEditor();
  try {
    await startLongTaskProbe(page);
    await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
    await stubOpenDialog(application, large20);
    await expect.poll(() => application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu()?.getMenuItemById("file-open"))),
    { timeout: 5_000 }).toBe(true);
    // The clock starts at the open request, not at launch.
    await page.evaluate(() => performance.mark("open-20mb-start"));
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
    await page.evaluate(() => performance.mark("open-20mb-editable"));
    const editableAfter = Date.now() - started;
    await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
      firstLine.replace(/^#+\s*/u, ""),
      { timeout: 10_000 },
    );
    await page.evaluate(() => performance.mark("open-20mb-first-preview"));
    const previewAfter = Date.now() - started;
    const probe = await page.evaluate(() => {
      const value = (window as unknown as { __longTaskProbe?: LongTaskProbe })
        .__longTaskProbe;
      const retainedMarks = performance.getEntriesByType("mark").map((entry) => ({
        name: entry.name,
        start: entry.startTime,
      }));
      return {
        longtasks: value?.longtasks ?? [],
        marks: [...(value?.marks ?? []), ...retainedMarks],
        frames: value?.frames ?? [],
      };
    });
    console.log(
      `AC-PERF-11 20MB open: editable=${String(editableAfter)}ms ` +
      `firstPreview=${String(previewAfter)}ms`,
    );
    console.log(`AC-PERF-11 phases: ${phaseSummary(probe.marks)}`);
    console.log(
      `AC-PERF-11 LoAF attribution: ` +
      markedFrameDiagnostics(
        probe.marks,
        probe.frames,
        "open-20mb-start",
        "open-20mb-first-preview",
      ),
    );
    expect(editableAfter).toBeLessThan(1_500);
    expect(previewAfter).toBeLessThan(1_000);
  } finally {
    await closeEditor(application, page);
  }
});
