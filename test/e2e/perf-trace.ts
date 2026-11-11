import { promises as fs } from "node:fs";

import type { CDPSession, Page } from "@playwright/test";

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "v8",
  "v8.gc",
  "blink.user_timing",
].join(",");
const START_MARK = "perf-diagnostic-window-start";
const END_MARK = "perf-diagnostic-window-end";
const MICROSECONDS_PER_MILLISECOND = 1_000;
const LONG_TASK_MICROSECONDS = 50 * MICROSECONDS_PER_MILLISECOND;

interface TraceEvent {
  cat: string;
  dur: number;
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
}

interface TaskCosts {
  gc: number;
  layout: number;
  paint: number;
  script: number;
  style: number;
}

interface TimeInterval {
  end: number;
  start: number;
}

type CostIntervals = Record<keyof TaskCosts, TimeInterval[]>;

export interface PerfTraceResult {
  summary(label: string): string;
  write(filePath: string): Promise<void>;
}

export interface PerfTrace {
  markStart(): Promise<number>;
  stop(): Promise<PerfTraceResult>;
}

type FinishTrace = () => Promise<PerfTraceResult>;

function numberField(value: Record<string, unknown>, name: string): number | undefined {
  const field = value[name];
  return typeof field === "number" ? field : undefined;
}

function stringField(value: Record<string, unknown>, name: string): string | undefined {
  const field = value[name];
  return typeof field === "string" ? field : undefined;
}

function parseTraceEvent(value: unknown): TraceEvent | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const name = stringField(record, "name");
  const phase = stringField(record, "ph");
  const timestamp = numberField(record, "ts");
  const process = numberField(record, "pid");
  const thread = numberField(record, "tid");
  if (name === undefined || phase === undefined || timestamp === undefined ||
      process === undefined || thread === undefined) {
    return undefined;
  }
  return {
    cat: stringField(record, "cat") ?? "",
    dur: numberField(record, "dur") ?? 0,
    name,
    ph: phase,
    pid: process,
    tid: thread,
    ts: timestamp,
  };
}

function overlap(event: TraceEvent, task: TraceEvent): TimeInterval | undefined {
  const start = Math.max(event.ts, task.ts);
  const end = Math.min(event.ts + event.dur, task.ts + task.dur);
  return end > start ? { end, start } : undefined;
}

function addEventCost(
  event: TraceEvent,
  task: TraceEvent,
  intervals: CostIntervals,
): void {
  const interval = overlap(event, task);
  if (interval === undefined) {
    return;
  }
  if (event.cat.split(",").includes("v8.gc") || /(?:^|\.)GC/u.test(event.name)) {
    intervals.gc.push(interval);
  }
  if (event.name === "FunctionCall" || event.name === "EvaluateScript") {
    intervals.script.push(interval);
  } else if (event.name === "UpdateLayoutTree" || event.name === "RecalculateStyles") {
    intervals.style.push(interval);
  } else if (event.name === "Layout") {
    intervals.layout.push(interval);
  } else if (event.name === "Paint") {
    intervals.paint.push(interval);
  }
}

function sumIntervals(intervals: readonly TimeInterval[]): number {
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  let total = 0;
  let coveredUntil = 0;
  for (const interval of sorted) {
    if (interval.end > coveredUntil) {
      total += interval.end - Math.max(interval.start, coveredUntil);
      coveredUntil = interval.end;
    }
  }
  return total;
}

function costsForTask(events: readonly TraceEvent[], task: TraceEvent): TaskCosts {
  const intervals: CostIntervals = {
    gc: [], layout: [], paint: [], script: [], style: [],
  };
  for (const event of events) {
    if (event.pid === task.pid && event.tid === task.tid) {
      addEventCost(event, task, intervals);
    }
  }
  return {
    gc: sumIntervals(intervals.gc),
    layout: sumIntervals(intervals.layout),
    paint: sumIntervals(intervals.paint),
    script: sumIntervals(intervals.script),
    style: sumIntervals(intervals.style),
  };
}

function milliseconds(microseconds: number): string {
  return (microseconds / MICROSECONDS_PER_MILLISECOND).toFixed(1);
}

function taskSummary(
  events: readonly TraceEvent[],
  task: TraceEvent,
  windowStart: number,
): string {
  const costs = costsForTask(events, task);
  return `start=${milliseconds(task.ts - windowStart)}ms ` +
    `duration=${milliseconds(task.dur)}ms gc=${milliseconds(costs.gc)}ms ` +
    `script=${milliseconds(costs.script)}ms style=${milliseconds(costs.style)}ms ` +
    `layout=${milliseconds(costs.layout)}ms paint=${milliseconds(costs.paint)}ms`;
}

export function summarizePerfTrace(
  label: string,
  rawEvents: readonly unknown[],
): string {
  const events = rawEvents.map(parseTraceEvent).filter(
    (event): event is TraceEvent => event !== undefined,
  );
  const start = events.find((event) => event.name === START_MARK);
  const end = events.find((event) => event.name === END_MARK);
  if (start === undefined || end === undefined) {
    return `${label} trace: longtasks=[] marks=missing`;
  }
  const tasks = events.filter((event) =>
    event.name === "RunTask" && event.ph === "X" &&
    event.pid === start.pid && event.tid === start.tid &&
    event.ts >= start.ts && event.ts < end.ts && event.dur >= LONG_TASK_MICROSECONDS,
  ).sort((left, right) => right.dur - left.dur).slice(0, 3);
  const summaries = tasks.map((task) => taskSummary(events, task, start.ts));
  return `${label} trace: longtasks=[${summaries.join("; ")}]`;
}

function waitForTraceCompletion(session: CDPSession): Promise<void> {
  return new Promise((resolve) => {
    session.once("Tracing.tracingComplete", () => resolve());
  });
}

export async function startPerfTraceWithSession(
  session: CDPSession,
  mark: (name: string) => Promise<number>,
): Promise<PerfTrace> {
  const rawEvents: unknown[] = [];
  session.on("Tracing.dataCollected", (payload) => rawEvents.push(...payload.value));
  const completed = waitForTraceCompletion(session);
  await session.send("Tracing.start", {
    categories: TRACE_CATEGORIES,
    options: "record-until-full",
    transferMode: "ReportEvents",
  });
  let result: Promise<PerfTraceResult> | undefined;
  return {
    markStart: () => mark(START_MARK),
    stop: () => {
      result ??= stopTraceWithMark(mark, session, completed, rawEvents);
      return result;
    },
  };
}

async function stopTraceWithMark(
  mark: (name: string) => Promise<number>,
  session: CDPSession,
  completed: Promise<void>,
  rawEvents: unknown[],
): Promise<PerfTraceResult> {
  await mark(END_MARK);
  await session.send("Tracing.end");
  await completed;
  await session.detach();
  return traceResult(rawEvents);
}

function traceResult(rawEvents: unknown[]): PerfTraceResult {
  return {
    summary: (label) => summarizePerfTrace(label, rawEvents),
    write: async (filePath) => {
      await fs.writeFile(filePath, JSON.stringify({ traceEvents: rawEvents }));
    },
  };
}

export async function startPerfTrace(page: Page): Promise<PerfTrace> {
  const session = await page.context().newCDPSession(page);
  return startPerfTraceWithSession(session, (name) => page.evaluate((mark) => {
    performance.mark(mark);
    return performance.now();
  }, name));
}

export async function runPerfTrace<T>(
  trace: PerfTrace,
  label: string,
  failurePath: string,
  action: (finish: FinishTrace) => Promise<T>,
): Promise<T> {
  let result: Promise<PerfTraceResult> | undefined;
  const finish = async (): Promise<PerfTraceResult> => {
    result ??= trace.stop().then((stopped) => {
      console.log(stopped.summary(label));
      return stopped;
    });
    return result;
  };
  try {
    const value = await action(finish);
    await finish();
    return value;
  } catch (error) {
    const stopped = await finish();
    await stopped.write(failurePath);
    throw error;
  }
}
