// Temporary diagnostic copy of the AC-PERF-09 500 KB case. Owns the probe from
// branch bug/perf09-diag, plus a Chromium content trace kept only on a failing
// fling. See docs/dev/notes/perf09-ubuntu-flake.md. Not for landing as-is.
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type CDPSession,
  type Page,
} from "@playwright/test";

import { closeEditor, launchEditor, repositoryRoot } from "./helpers";

const large500 = path.join(repositoryRoot, "test/fixtures/big/large-500kb.md");
const traceDirectory = path.join(repositoryRoot, "test-results/perf09-traces");

const TRACE_CATEGORIES = [
  "toplevel",
  "benchmark",
  "cc",
  "viz",
  "gpu",
  "gpu.command_buffer",
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.invalidationTracking",
  "disabled-by-default-toplevel.flow",
  "renderer.scheduler",
  "latency",
  "blink",
];

interface ContentTrace {
  session: CDPSession;
  events: Record<string, unknown>[];
  stop(): Promise<Record<string, unknown>[]>;
}

async function startContentTrace(page: Page): Promise<ContentTrace> {
  const session = await page.context().newCDPSession(page);
  const events: Record<string, unknown>[] = [];
  let complete: () => void = () => undefined;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  session.on("Tracing.dataCollected", (value: { value: Record<string, unknown>[] }) => {
    events.push(...value.value);
  });
  session.on("Tracing.tracingComplete", () => complete());
  await session.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: { includedCategories: TRACE_CATEGORIES },
  });
  return {
    session,
    events,
    async stop() {
      await session.send("Tracing.end");
      await completed;
      await session.detach();
      return events;
    },
  };
}

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

async function expectSmoothTracedScroll(
  page: Page,
  label: string,
): Promise<void> {
  const trace = await startContentTrace(page);
  await startScrollProbe(page);
  const probe = await flingPreview(page);
  const events = await trace.stop();
  const slowFrames = probe.frames.filter((duration) => duration > 32);
  console.log(
    `${label}: frames=${String(probe.frames.length)} ` +
    `maxFrame=${Math.max(...probe.frames, 0).toFixed(1)}ms ` +
    `frames>32ms=${String(slowFrames.length)} ` +
    `longtasks=${String(probe.longtasks.length)} ` +
    `traceEvents=${String(events.length)}`,
  );
  if (slowFrames.length > 0) {
    await fs.mkdir(traceDirectory, { recursive: true });
    const tracePath = path.join(
      traceDirectory,
      `diag-${label.replace(/[^a-z0-9]+/giu, "-").toLowerCase()}-` +
      `${String(Date.now())}.json`,
    );
    await fs.writeFile(tracePath, JSON.stringify(events));
    console.log(`AC-PERF-09 diag: kept failing trace at ${tracePath}`);
  }
  expect(slowFrames).toEqual([]);
  expect(probe.longtasks).toEqual([]);
}

test("AC-PERF-09: traced fling-scrolling the 500 KB preview has no frame over 32 ms", {
  tag: ["@AC-PERF-09", "@PERF09-DIAG"],
  annotation: { type: "AC-PERF-09" },
}, async () => {
  const { application, page } = await launchEditor(large500);
  try {
    await expect(page.getByTestId("editor").locator(".cm-content")).toContainText(
      (await fs.readFile(large500, "utf8")).split("\n")[0] ?? "",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
      ((await fs.readFile(large500, "utf8")).split("\n")[0] ?? "").replace(
        /^#+\s*/u,
        "",
      ),
      { timeout: 10_000 },
    );
    await expect.poll(() => page.getByTestId("preview").evaluate(
      (element) => (element as HTMLElement).dataset["renderComplete"],
    ), { timeout: 30_000 }).toBe("true");
    const shape = await page.evaluate(() => ({
      blocks: document.querySelectorAll("#preview .preview-block").length,
      pages: document.querySelectorAll("#preview .preview-page").length,
      sections: document.querySelectorAll("#preview .preview-section").length,
    }));
    console.log(`AC-PERF-09 diag 500KB shape: ${JSON.stringify(shape)}`);
    await expectSmoothTracedScroll(page, "AC-PERF-09 diag 500KB scroll");
  } finally {
    await closeEditor(application, page);
  }
});
