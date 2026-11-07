import { ChangeSet, Text } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RenderResponse, RenderResult } from "../../src/shared/workers/render";
import {
  DATA_LINE_PREFIX,
  rangeIndexAt,
  shiftChunkDataLines,
  splitChunks,
} from "../../src/renderer/workers/render/chunks";
import { IncrementalRenderState } from "../../src/renderer/workers/render/incremental";
import { RenderWorkerHandler } from "../../src/renderer/workers/render/handler";

function textFrom(source: string): Text {
  return Text.of(source.split("\n"));
}

function changeJson(
  document: Text,
  from: number,
  insert: string,
  to = from,
): { changes: ReturnType<ChangeSet["toJSON"]>; after: Text } {
  const change = ChangeSet.of({ from, to, insert }, document.length);
  return { changes: change.toJSON(), after: change.apply(document) };
}

class FakeScope {
  readonly responses: RenderResponse[] = [];
  postMessage = (response: RenderResponse): void => {
    this.responses.push(response);
  };
  results(): RenderResult[] {
    return this.responses.filter((response): response is RenderResult =>
      !("op" in response));
  }
}

interface FillIdentity {
  docId: string;
  epoch: number;
  version: number;
}

// The worker holds the next fill batch until the preview acknowledges the last
// one, so a test must ack each append before advancing the timers again.
async function drainFill(
  handler: RenderWorkerHandler,
  scope: FakeScope,
  identity: FillIdentity = { docId: "doc", epoch: 1, version: 0 },
): Promise<void> {
  for (let pass = 0; pass < 1000; pass += 1) {
    const before = scope.results().filter((result) =>
      result.ok && result.mode === "append").length;
    await vi.runAllTimersAsync();
    const appends = scope.results().filter((result): result is RenderResult & {
      ok: true;
      mode: "append";
    } => result.ok && result.mode === "append");
    const last = appends.at(-1);
    if (!last || last.complete) {
      return;
    }
    if (appends.length === before) {
      return;
    }
    handler.handle({
      op: "fill-ready",
      ...identity,
      token: last.fillToken,
    });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("markdown chunks", () => {
  it("AC-R1-10: splits on blank lines but not inside a fenced block", () => {
    const lines = [
      "# Heading",
      "",
      "paragraph",
      "",
      "```js",
      "",
      "const value = 1;",
      "```",
      "",
      "after",
    ];

    expect(splitChunks(lines)).toEqual([
      { startLine: 0, endLine: 1 },
      { startLine: 2, endLine: 3 },
      { startLine: 4, endLine: 8 },
      { startLine: 9, endLine: 10 },
    ]);
  });

  it("AC-R1-10: treats a tilde fence and its own closing marker as one chunk", () => {
    expect(splitChunks(["~~~", "", "text", "~~~", "", "next"])).toEqual([
      { startLine: 0, endLine: 4 },
      { startLine: 5, endLine: 6 },
    ]);
  });

  it("AC-R1-10: ignores a fence marker that is shorter than the open fence", () => {
    expect(splitChunks(["````", "", "```", "", "````", "", "after"])).toEqual([
      { startLine: 0, endLine: 5 },
      { startLine: 6, endLine: 7 },
    ]);
  });

  it("AC-R1-10: indexes ranges around blank separators", () => {
    const ranges = [
      { startLine: 0, endLine: 1 },
      { startLine: 2, endLine: 3 },
    ];

    expect([
      rangeIndexAt(ranges, 0),
      rangeIndexAt(ranges, 1),
      rangeIndexAt(ranges, 2),
      rangeIndexAt(ranges, 9),
    ]).toEqual([0, 1, 1, 2]);
  });

  it("AC-R1-04: shifts chunk-local source lines into document lines", () => {
    const line = (value: number): string => `${DATA_LINE_PREFIX}${String(value)}`;
    expect(shiftChunkDataLines(`<p data-line="${line(0)}">x</p>`, 0))
      .toBe('<p data-line="0">x</p>');
    expect(shiftChunkDataLines(
      `<h1 data-line="${line(0)}">a</h1><p data-line="${line(2)}">b</p>`,
      7,
    )).toBe('<h1 data-line="7">a</h1><p data-line="9">b</p>');
  });
});

describe("incremental render state", () => {
  it("AC-R1-04: renders each chunk with document-absolute data lines", () => {
    const state = new IncrementalRenderState(
      "doc",
      1,
      0,
      textFrom("# Heading\n\nparagraph"),
      (source) => source,
    );

    const batch = state.initial();

    expect(batch.complete).toBe(true);
    expect(batch.blocks.map((block) => block.startLine)).toEqual([0, 2]);
    // A chunk keeps the line break that ends it so raw HTML blocks render the
    // same as in a full document; the final chunk has no line break after it.
    expect(batch.blocks[0]?.html).toBe("# Heading\n");
    expect(batch.blocks[1]?.html).toBe("paragraph");
    expect(state.published).toBe(true);
  });

  it("AC-R1-09: an in-place edit replaces only the touched chunk and keeps ids", () => {
    const document = textFrom("one\n\ntwo\n\nthree");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    const first = state.initial();
    const { changes, after } = changeJson(document, document.line(3).from + 1, "X");

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    expect(patch.blocks).toHaveLength(1);
    expect(patch.blocks[0]?.block.html).toBe("tXwo\n");
    expect(patch.blocks[0]?.block.id).not.toBe(first.blocks[1]?.id);
    expect(patch.removed).toEqual([first.blocks[1]?.id]);
    expect(patch.complete).toBe(true);
  });

  it("AC-R1-09: adding a blank line creates patch blocks with correct anchors", () => {
    const document = textFrom("one\n\ntwo\n\nthree");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();
    const { changes, after } = changeJson(document, document.length, "\n\nfour");

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    expect(patch.blocks.map((entry) => entry.block.html)).toEqual(["three\n", "four"]);
    expect(patch.blocks.map((entry) => entry.block.startLine)).toEqual([4, 6]);
    expect(patch.blocks.map((entry) => entry.after)).toEqual(["block-2", "block-4"]);
  });

  it("AC-R1-10: a change in a blank separator re-chunks the neighbouring blocks", () => {
    const document = textFrom("one\n\ntwo");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();
    const { changes, after } = changeJson(document, 3, "", 4);

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    expect(patch.blocks.map((entry) => entry.block.html)).toEqual(["one\ntwo"]);
    expect(patch.removed).toHaveLength(2);
  });

  it("AC-R1-09: expands the replacement to the whole block above the change", () => {
    const document = textFrom("alpha\nbeta\n\ngamma");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();
    const { changes, after } = changeJson(document, document.line(2).from + 1, "X");

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    expect(patch.blocks.map((entry) => entry.block.html)).toEqual(["alpha\nbXeta\n"]);
    expect(patch.blocks[0]?.after).toBeNull();
  });

  it("AC-R1-09: re-chunks from a block boundary inside a separator run", () => {
    const document = textFrom("one\n\n\ntwo");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();
    const { changes, after } = changeJson(document, document.line(3).from, " ");

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    // The separator belongs to the block above, so that block is re-parsed
    // even though its text did not change.
    expect(patch.blocks.map((entry) => entry.block.startLine)).toEqual([0]);
  });

  it("AC-R1-09: an edit after the final blank line re-chunks the trailing block", () => {
    const document = textFrom("one\n\n");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    const first = state.initial();
    const { changes, after } = changeJson(document, document.length, "x");

    state.applyChange(document, after, 0, 1, changes);
    const patch = state.patch();

    // The new trailing block is after the published prefix, so the fill pass
    // appends it instead of patching it into the preview.
    expect(patch.blocks).toEqual([]);
    expect(patch.removed).toEqual([]);
    const filled = state.fill();
    expect(filled.blocks.map((entry) => entry.html)).toEqual(["x"]);
    expect(filled.complete).toBe(true);
    expect(first.blocks).toHaveLength(1);
  });

  it("AC-R1-07: an empty change set still advances the document version", () => {
    const document = textFrom("one");
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();

    state.applyChange(document, document, 0, 1, []);

    expect(state.version).toBe(1);
    expect(state.document).toBe(document);
  });

  it("AC-R1-10: finds a reuse boundary past the chunks already split", () => {
    const leading = Array.from(
      { length: 11 },
      (_, index) => `paragraph ${String(index)}`,
    ).join("\n\n");
    const fence = ["```", "alpha", "beta", "gamma", "delta", "epsilon", "```"]
      .join("\n");
    const document = textFrom(`${leading}\n\n${fence}\n\nafter`);
    const state = new IncrementalRenderState("doc", 1, 0, document, (source) => source);
    state.initial();
    let beta = 0;
    for (let number = 1; number <= document.lines; number += 1) {
      if (document.line(number).text === "beta") {
        beta = number;
        break;
      }
    }
    const change = ChangeSet.of(
      { from: document.line(beta).from + 1, insert: "X" },
      document.length,
    );
    const after = change.apply(document);

    state.applyChange(document, after, 0, 1, change.toJSON());

    const patch = state.patch();
    expect(patch.blocks).toHaveLength(1);
    expect(patch.blocks[0]?.block.html).toContain("bXeta");
  });

  it("AC-R1-10: an edit after the published prefix is left for the fill pass", () => {
    vi.useFakeTimers();
    const chunks = Array.from({ length: 120 }, (_, index) =>
      `paragraph ${String(index)} ${"x".repeat(20_000)}\n\n`).join("");
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: chunks });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    const document = textFrom(chunks);
    const { changes } = changeJson(
      document,
      document.line(110).from + 1,
      "Z",
    );

    handler.handle({ op: "change", docId: "doc", epoch: 1, fromVersion: 0,
      toVersion: 1, changes });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });
    const patch = scope.results()[1];

    expect(patch?.ok).toBe(true);
    if (patch?.ok && patch.mode === "patch") {
      expect(patch.blocks).toHaveLength(0);
      expect(patch.complete).toBe(false);
    }
    vi.clearAllTimers();
  });

  it("AC-R1-07: ignores a change for a version the state has already passed", () => {
    const document = textFrom("one");
    const state = new IncrementalRenderState("doc", 1, 3, document, (source) => source);
    const { changes, after } = changeJson(document, 0, "changed ");

    state.applyChange(document, after, 1, 2, changes);

    expect(state.version).toBe(3);
  });
});

describe("progressive large-document rendering", () => {
  function largeDocument(): string {
    return Array.from(
      { length: 120 },
      (_, index) => `paragraph ${String(index)} ${"x".repeat(20_000)}\n`,
    ).join("\n");
  }

  it("AC-PERF-11: publishes the first screen, then appends the rest in the background", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: largeDocument(),
    });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });

    const first = scope.results()[0];
    expect(first?.ok).toBe(true);
    if (first?.ok && first.mode === "replace") {
      expect(first.blocks).toHaveLength(12);
      expect(first.complete).toBe(false);
    }

    await drainFill(handler, scope);
    const appended = scope.results().slice(1);
    expect(appended.length).toBeGreaterThan(0);
    const appendedBlocks = appended.flatMap((result) =>
      result.ok && result.mode === "append" ? result.blocks : []);
    expect(appendedBlocks).toHaveLength(108);
    const last = appended.at(-1);
    expect(last?.ok && last.mode === "append" ? last.complete : false).toBe(true);
  });

  it("AC-R1-05: a change during the fill pass cancels the stale fill and patches first", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    const text = largeDocument();
    const document = textFrom(text);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    const { changes } = changeJson(document, document.line(2).from + 1, "Y");

    handler.handle({ op: "change", docId: "doc", epoch: 1, fromVersion: 0,
      toVersion: 1, changes });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });

    const patch = scope.results()[1];
    expect(patch?.ok).toBe(true);
    if (patch?.ok && patch.mode === "patch") {
      expect(patch.blocks).toHaveLength(1);
    }

    await drainFill(handler, scope, { docId: "doc", epoch: 1, version: 1 });
    const last = scope.results().at(-1);
    expect(last?.ok && last.mode === "append" ? last.complete : false).toBe(true);
  });

  it("AC-PERF-11: fills a large document across successive append batches", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    const text = Array.from(
      { length: 250 },
      (_, index) => `paragraph ${String(index)} ${"x".repeat(20_000)}`,
    ).join("\n\n");
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });

    await drainFill(handler, scope, { docId: "doc", epoch: 1, version: 0 });
    const appends = scope.results().filter((result) =>
      result.ok && result.mode === "append");
    const appendedBlocks = appends.flatMap((result) =>
      result.ok && result.mode === "append" ? result.blocks : []);
    const last = appends.at(-1);

    expect(appends.length).toBeGreaterThanOrEqual(2);
    expect(appendedBlocks).toHaveLength(238);
    expect(last?.ok && last.mode === "append" ? last.complete : false).toBe(true);
  });

  it("AC-PERF-10: each progressive fill limits synchronous preview work", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: largeDocument(),
    });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });

    await drainFill(handler, scope);
    const appends = scope.results().filter((result) =>
      result.ok && result.mode === "append");

    expect(appends.length).toBeGreaterThan(0);
    for (const result of appends) {
      if (result.ok && result.mode === "append") {
        expect(result.blocks.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("AC-R1-06: a non-Error fill failure is reported as a message", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const render = (source: string): string => {
      if (source.includes("BOOM")) {
        throw "fill failed";
      }
      return source;
    };
    const text = largeDocument().replace("paragraph 60", "BOOM 60");
    const handler = new RenderWorkerHandler(scope.postMessage, render);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });

    await drainFill(handler, scope, { docId: "doc", epoch: 1, version: 0 });
    const failure = scope.results().find((result) => !result.ok);

    expect(failure?.ok).toBe(false);
    if (failure && !failure.ok) {
      expect(failure.message).toBe("fill failed");
    }
  });

  it("AC-R1-06: a fill-pass parse failure is reported without crashing the worker", async () => {
    vi.useFakeTimers();
    const scope = new FakeScope();
    const render = (source: string): string => {
      if (source.includes("BOOM")) {
        throw new Error("chunk failed");
      }
      return source;
    };
    const text = largeDocument().replace("paragraph 60", "BOOM 60");
    const handler = new RenderWorkerHandler(scope.postMessage, render);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });

    await drainFill(handler, scope, { docId: "doc", epoch: 1, version: 0 });
    const failure = scope.results().find((result) => !result.ok);

    expect(failure?.ok).toBe(false);
    if (failure && !failure.ok) {
      expect(failure.message).toBe("chunk failed");
    }
  });
});

describe("render worker cache lifecycle", () => {
  it("AC-R1-07: a newer epoch discards the cached render state", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "one" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "attach", docId: "doc", epoch: 2, version: 0, text: "two" });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 2, version: 0 });

    const second = scope.results()[1];
    expect(second?.ok && second.mode).toBe("replace");
  });

  it("AC-R1-07: a resync attach at a new version rebuilds the published render", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "one" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 1, text: "two" });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });

    const second = scope.results()[1];
    expect(second?.ok).toBe(true);
    if (second?.ok && second.mode === "replace") {
      expect(second.blocks[0]?.html).toBe("two");
    }
  });

  it("AC-R1-07: a change that the cache cannot apply discards the cache", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    const document = textFrom("one");
    const { changes } = changeJson(document, 3, " two");
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "one" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "change", docId: "doc", epoch: 1, fromVersion: 5,
      toVersion: 6, changes });

    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 0 });
    expect(scope.responses.at(-1)).toMatchObject({ op: "resync", id: 2 });
  });

  it("AC-R1-07: detaching a document without a cache is harmless", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);

    handler.handle({ op: "detach", docId: "missing" });

    expect(scope.responses).toEqual([]);
  });

  it("AC-R1-07: detaching a rendered document removes its cached blocks", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "one" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "detach", docId: "doc" });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 0 });

    expect(scope.responses.at(-1)).toMatchObject({ op: "resync", id: 2 });
  });

  it("AC-R1-07: ignores a fill tick that a newer render already superseded", () => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal("setTimeout", (callback: () => void) => {
      callbacks.push(callback);
      return 0;
    });
    vi.stubGlobal("clearTimeout", () => undefined);
    try {
      const scope = new FakeScope();
      const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
      const text = Array.from(
        { length: 120 },
        (_, index) => `paragraph ${String(index)} ${"x".repeat(20_000)}`,
      ).join("\n\n");
      handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text });
      handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
      handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 0 });

      expect(callbacks).toHaveLength(2);
      callbacks[0]?.();
      expect(scope.results().filter((result) =>
        result.ok && result.mode === "append")).toHaveLength(0);

      callbacks[1]?.();
      expect(scope.results().some((result) =>
        result.ok && result.mode === "append")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AC-R1-10: renders an empty document without chunks", () => {
    const scope = new FakeScope();
    const handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 1, version: 0 });

    expect(scope.results()[0]).toMatchObject({ mode: "replace", blocks: [] });
    expect(scope.results()[1]).toMatchObject({ mode: "patch", blocks: [] });
  });
});
