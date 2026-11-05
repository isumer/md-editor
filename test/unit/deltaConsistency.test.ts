// @vitest-environment jsdom

import { ChangeSet, Text } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RenderResponse } from "../../src/shared/workers/render";
import {
  wireRenderWorker,
} from "../../src/renderer/features/preview/preview";
import { RenderScheduler } from "../../src/renderer/features/preview/renderScheduler";
import { sanitizeRenderedHtml } from "../../src/renderer/features/preview/sanitize";
import { RenderWorkerHandler } from "../../src/renderer/workers/render/handler";
import { renderMarkdown } from "../../src/renderer/workers/render/render";

const DOC_ID = "doc";
// Just past the point where the worker publishes only the first chunks and
// leaves the rest to the fill pass.
const PROGRESSIVE_BYTES = 2 * 1024 * 1024;

interface FakeWorker {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

function randomGenerator(seed: number): (limit: number) => number {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % limit;
  };
}

function initialSource(seed: number): string {
  const parts: string[] = [
    "# Delta consistency",
    "",
    `Seed ${String(seed)} exercises worker deltas.`,
    "",
  ];
  for (let index = 0; index < 34; index += 1) {
    parts.push(
      `## Section ${String(index)}`,
      "",
      `Paragraph ${String(index)} with a [reference][ref${String(index % 3)}] and \`code\`.`,
      "",
      `- item ${String(index)}`,
      `- item ${String(index)}b`,
      "",
    );
  }
  parts.push(
    "[ref0]: https://example.com/zero",
    "[ref1]: https://example.com/one",
    "[ref2]: https://example.com/two",
    "",
    "```text",
    "closing fence keeps this chunk whole",
    "```",
    "",
  );
  const leading = parts.join("\n");
  // One more chunk big enough to make the render progressive; it stays a
  // single paragraph so the fill cost is one block, not thousands.
  // A raw HTML comment pushes the document past the progressive threshold but
  // renders cheaply: DOMPurify drops it, so the preview keeps no huge text node.
  const padding = `<!--${"a".repeat(PROGRESSIVE_BYTES + 8_000)}-->`;
  return `${leading}${padding}`;
}

function textFrom(source: string): Text {
  return Text.of(source.split("\n"));
}

function withoutDataLines(html: string): string {
  return html.replace(/ data-line="\d+"/g, "");
}

const FRAGMENTS = [
  "x",
  "\n",
  "\n\n",
  "- item\n",
  "```\n",
  "[x]: u\n",
  "    indented\n",
  "~~~\n",
] as const;

interface Editor {
  doc: Text;
  epoch: number;
  version: number;
}

interface SeedStats {
  failed: boolean;
  resyncs: number;
  epochs: number;
}

function runSeed(seed: number): SeedStats {
  vi.useFakeTimers();
  const random = randomGenerator(seed);
  const preview = document.createElement("div");
  const editor: Editor = {
    doc: textFrom(initialSource(seed)),
    epoch: 1,
    version: 0,
  };

  const responses: RenderResponse[] = [];
  let failedOnce = false;
  let failNext = false;
  let resyncs = 0;

  const handler = new RenderWorkerHandler((response) => {
    responses.push(response);
  }, (source, environment) => {
    if (failNext) {
      failNext = false;
      failedOnce = true;
      throw new Error("planned render failure");
    }
    return renderMarkdown(source, environment);
  });

  const worker: FakeWorker = {
    postMessage: (message) => {
      handler.handle(message);
    },
    onmessage: null,
    onerror: null,
  };

  const attachCurrent = (): void => {
    handler.handle({
      op: "attach",
      docId: DOC_ID,
      epoch: editor.epoch,
      version: editor.version,
      text: editor.doc.toString(),
    });
  };
  attachCurrent();

  let lastDispatch: { id: number; epoch: number; version: number } | null = null;
  const scheduler = new RenderScheduler((request) => {
    lastDispatch = {
      id: request.id,
      epoch: editor.epoch,
      version: editor.version,
    };
    handler.handle({
      op: "render",
      id: request.id,
      docId: DOC_ID,
      epoch: editor.epoch,
      version: editor.version,
    });
  }, {
    now: () => 0,
    maximumWaitMilliseconds: 100,
    requestFrame: (callback) => setTimeout(callback, 0) as unknown as number,
    cancelFrame: (handle) => {
      clearTimeout(handle);
    },
    setTimer: (callback, milliseconds) =>
      setTimeout(callback, milliseconds) as unknown as number,
    clearTimer: (handle) => {
      clearTimeout(handle);
    },
  });
  wireRenderWorker(worker, {
    scheduler,
    preview,
    showStatus: () => undefined,
    showError: () => undefined,
    currentVersion: () => ({
      docId: DOC_ID,
      epoch: editor.epoch,
      version: editor.version,
    }),
    onResync: () => {
      resyncs += 1;
      attachCurrent();
    },
    rewriteHtml: (html) => html,
  });

  // Observe which render requests the real wiring actually applied: a resync
  // or a failed render consumes a request without updating the preview.
  const appliedRequests = new Set<number>();
  const applyResult = scheduler.applyResult.bind(scheduler);
  scheduler.applyResult = (id, result, apply) => {
    const applied = applyResult(id, result, apply);
    if (applied && (result as { ok?: boolean }).ok === true) {
      appliedRequests.add(id);
    }
    return applied;
  };

  const flush = (): void => {
    while (responses.length > 0) {
      const response = responses.shift();
      if (response) {
        worker.onmessage?.({ data: response } as unknown as MessageEvent<RenderResponse>);
      }
    }
  };

  const edit = (deliver: boolean): void => {
    const length = editor.doc.length;
    const inPadding = random(20) === 0;
    const from = inPadding
      ? Math.max(0, length - 1 - random(200))
      : random(Math.min(length, 4_000) + 1);
    const deleting = random(5) === 0 && from < length;
    const to = deleting ? Math.min(length, from + 1 + random(12)) : from;
    const insert = deleting
      ? ""
      : FRAGMENTS[random(FRAGMENTS.length)] ?? "";
    const change = ChangeSet.of({ from, to, insert }, length);
    const before = editor.doc;
    const after = change.apply(before);
    editor.doc = after;
    const fromVersion = editor.version;
    editor.version += 1;
    if (deliver) {
      handler.handle({
        op: "change",
        docId: DOC_ID,
        epoch: editor.epoch,
        fromVersion,
        toVersion: editor.version,
        changes: change.toJSON(),
      });
    }
  };

  const newEpoch = (): void => {
    editor.epoch += 1;
    editor.version = 0;
    attachCurrent();
  };

  for (let step = 0; step < 14; step += 1) {
    switch (random(9)) {
      case 0:
      case 1:
        edit(true);
        break;
      case 2:
        // A change the worker never sees; a later render must resync.
        edit(false);
        break;
      case 3:
        scheduler.schedule();
        break;
      case 4:
        vi.advanceTimersByTime(1);
        break;
      case 5:
        flush();
        break;
      case 6:
        failNext = true;
        scheduler.schedule();
        break;
      case 7:
        if (editor.epoch < 3) {
          newEpoch();
        } else {
          edit(true);
        }
        break;
      default:
        scheduler.schedule();
        flush();
        break;
    }
  }

  // Drain every queued delta on the current document version. A request may be
  // consumed by a resync (the editor moved while it was in flight) or fail, so
  // require a successful result for a request dispatched at the final version.
  for (let pass = 0; pass < 400; pass += 1) {
    scheduler.schedule();
    vi.advanceTimersByTime(5);
    flush();
    const dispatch = lastDispatch as
      { id: number; epoch: number; version: number } | null;
    if (dispatch && dispatch.epoch === editor.epoch &&
      dispatch.version === editor.version &&
      appliedRequests.has(dispatch.id) &&
      responses.length === 0 && vi.getTimerCount() === 0 &&
      preview.dataset["renderComplete"] === "true") {
      break;
    }
  }
  const finalDispatch = lastDispatch as { id: number } | null;
  expect(finalDispatch && appliedRequests.has(finalDispatch.id),
    `seed ${String(seed)} did not render its final version`).toBe(true);
  expect(responses, `seed ${String(seed)} left responses queued`).toEqual([]);
  expect(preview.dataset["renderComplete"], `seed ${String(seed)} not complete`)
    .toBe("true");

  const fullContainer = document.createElement("div");
  fullContainer.innerHTML = sanitizeRenderedHtml(renderMarkdown(editor.doc.toString()));
  const blocks = [...preview.querySelectorAll<HTMLElement>(".preview-block")];
  const shown = blocks.map((block) => block.innerHTML).join("");
  expect(blocks.length, `seed ${String(seed)} rendered no blocks`).toBeGreaterThan(0);
  // Line attributes of blocks that were not re-rendered are resolved lazily
  // through the preview's shift ledger, so compare the rendered content.
  expect(withoutDataLines(shown), `seed ${String(seed)} preview diverged`)
    .toBe(withoutDataLines(fullContainer.innerHTML));
  vi.useRealTimers();
  return { failed: failedOnce, resyncs, epochs: editor.epoch - 1 };
}

describe("delta consistency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("AC-R1-07: applies worker deltas interleaved with edits, fills, failures and resyncs", () => {
    let failed = 0;
    let resyncs = 0;
    let epochs = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const stats = runSeed(seed);
      failed += Number(stats.failed);
      resyncs += stats.resyncs;
      epochs += stats.epochs;
    }
    // Failing to reach these paths would weaken the property, so require the
    // suite to have exercised all of them at least once.
    expect(failed, "no planned render failure was reached").toBeGreaterThan(0);
    expect(resyncs, "no resync was requested").toBeGreaterThan(0);
    expect(epochs, "no new epoch was attached").toBeGreaterThan(0);
  }, 120_000);
});
