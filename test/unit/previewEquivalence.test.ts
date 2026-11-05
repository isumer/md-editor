import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { renderMarkdown } from "../../src/renderer/workers/render/render";
import {
  IncrementalRenderState,
  type PatchBatch,
  type RenderBatch,
} from "../../src/renderer/workers/render/incremental";

interface DisplayBlock {
  id: string;
  html: string;
}

function textFrom(source: string): Text {
  return Text.of(source.split("\n"));
}

function takeInitial(batch: RenderBatch, display: DisplayBlock[]): void {
  for (const block of batch.blocks) {
    display.push({ id: block.id, html: block.html });
  }
}

function takePatch(batch: PatchBatch, display: DisplayBlock[]): void {
  const removed = new Set(batch.removed);
  const next = display.filter((block) => !removed.has(block.id));
  for (const patch of batch.blocks) {
    const index = next.findIndex((block) => block.id === patch.block.id);
    if (index >= 0) {
      next[index] = { id: patch.block.id, html: patch.block.html };
      continue;
    }
    const anchor = patch.after === null
      ? -1
      : next.findIndex((block) => block.id === patch.after);
    next.splice(anchor + 1, 0, { id: patch.block.id, html: patch.block.html });
  }
  display.length = 0;
  display.push(...next);
}

function drain(state: IncrementalRenderState, display: DisplayBlock[]): string {
  if (!state.published) {
    takeInitial(state.initial(), display);
  } else {
    takePatch(state.patch(), display);
  }
  for (let pass = 0; pass < 1_000_000 && !state.complete; pass += 1) {
    for (const block of state.fill().blocks) {
      display.push({ id: block.id, html: block.html });
    }
  }
  return display.map((block) => block.html).join("");
}

function chunkedRender(source: string): string {
  const document = textFrom(source);
  const state = new IncrementalRenderState("doc", 1, 0, document, renderMarkdown);
  return drain(state, []);
}

function applyEdit(
  state: IncrementalRenderState,
  document: Text,
  change: ChangeSet,
  version: number,
): Text {
  const after = change.apply(document);
  state.applyChange(document, after, version, version + 1, change.toJSON());
  return after;
}

describe("chunked render equivalence", () => {
  it("AC-R1-10: resolves reference links defined in a later chunk", () => {
    const source = "See [the docs][d].\n\n[d]: https://example.com";
    const html = chunkedRender(source);

    expect(html).toBe(renderMarkdown(source));
    expect(html).toContain('href="https://example.com"');
  });

  it("AC-R1-10: resolves footnote-style definitions across chunks", () => {
    const source = "Note[^1].\n\n[^1]: https://example.com/footnote";
    const html = chunkedRender(source);

    expect(html).toBe(renderMarkdown(source));
    expect(html).toContain('href="https://example.com/footnote"');
  });

  it("AC-R1-10: keeps the first of two definitions for the same label", () => {
    const source = "See [d].\n\n[d]: https://example.com/one\n\n[d]: https://example.com/two";
    const html = chunkedRender(source);

    expect(html).toBe(renderMarkdown(source));
    expect(html).toContain('href="https://example.com/one"');
    expect(html).not.toContain("https://example.com/two");
  });

  it("AC-R1-10: keeps a loose list crossing a blank line as one list", () => {
    const source = "1. one\n\n2. two";
    const html = chunkedRender(source);

    expect(html).toBe(renderMarkdown(source));
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).toMatch(/<li\b/);
  });

  it("AC-R1-10: keeps indented code containing a blank line as one code block", () => {
    const source = "    first\n\n    second";
    const html = chunkedRender(source);

    expect(html).toBe(renderMarkdown(source));
    expect(html.match(/<pre/g)).toHaveLength(1);
  });

  it("AC-R1-10: opening a fence at the top re-parses the rest as code", () => {
    const document = textFrom("# One\n\nTwo");
    const state = new IncrementalRenderState("doc", 1, 0, document, renderMarkdown);
    const display: DisplayBlock[] = [];
    drain(state, display);

    const change = ChangeSet.of({ from: 0, insert: "```\n" }, document.length);
    const after = applyEdit(state, document, change, 0);

    expect(drain(state, display)).toBe(renderMarkdown(after.toString()));
    expect(display).toHaveLength(1);
  });

  it("AC-R1-10: re-renders blocks that use a reference when its definition changes", () => {
    const document = textFrom("See [the docs][d].\n\n[d]: https://one.example");
    const state = new IncrementalRenderState("doc", 1, 0, document, renderMarkdown);
    const display: DisplayBlock[] = [];
    expect(drain(state, display)).toContain("https://one.example");

    const change = ChangeSet.of({ from: document.length, insert: "two" }, document.length);
    const after = applyEdit(state, document, change, 0);

    expect(drain(state, display)).toBe(renderMarkdown(after.toString()));
    expect(display.map((block) => block.html).join("")).toContain("https://one.exampletwo");
  });
});

const GOLDEN_DIR = resolve(process.cwd(), "test/fixtures/golden");
const CORPUS = [
  "readme-project",
  "long-note",
  "sanitise-html",
  "crlf-line-endings",
  "unicode-turkish-cjk",
  "headings-all-levels",
  "empty",
  "long-lines",
  "changelog",
  "api-reference",
].map((name) => readFileSync(`${GOLDEN_DIR}/${name}.md`, "utf8"));

const FRAGMENTS = [
  "```",
  "    ",
  "[x]: u",
  "- ",
  "1. ",
  "\n",
  "\n\n",
  "text",
  "~~~",
  "`",
  "[a][x]",
] as const;

function withoutDataLines(html: string): string {
  return html.replace(/ data-line="\d+"/g, "");
}

function randomGenerator(seed: number): (limit: number) => number {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % limit;
  };
}

function runSeed(seed: number): void {
  const random = randomGenerator(seed);
  const source = CORPUS[seed % CORPUS.length] ?? "";
  let document = textFrom(source);
  let version = 0;
  const state = new IncrementalRenderState("doc", 1, version, document, renderMarkdown);
  const display: DisplayBlock[] = [];

  expect(drain(state, display), `seed ${String(seed)} initial`).toBe(
    renderMarkdown(document.toString()),
  );

  for (let step = 0; step < 8; step += 1) {
    const from = random(document.length + 1);
    let change: ChangeSet;
    if (random(4) === 0 && document.length > 0) {
      const to = Math.min(document.length, from + 1 + random(8));
      change = ChangeSet.of({ from, to }, document.length);
    } else {
      const insert = FRAGMENTS[random(FRAGMENTS.length)] ?? "";
      change = ChangeSet.of({ from, insert }, document.length);
    }
    document = applyEdit(state, document, change, version);
    version += 1;

    // Source-line attributes of untouched blocks are resolved through the
    // preview's shift ledger (finding 4) rather than rewritten per keystroke,
    // so this equivalence property compares the rendered content itself.
    expect(withoutDataLines(drain(state, display)), `seed ${String(seed)} step ${String(step)}`)
      .toBe(withoutDataLines(renderMarkdown(document.toString())));
  }
}

describe("chunked render equivalence property", () => {
  it("AC-R1-10: matches a full render over 500 seeded edit sequences", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      runSeed(seed);
    }
  }, 30_000);
});

describe("incremental re-parse cost", () => {
  it("AC-R1-10: an edit inside one paragraph re-parses a small constant number of chunks", () => {
    const paragraphs = Array.from(
      { length: 200 },
      (_, index) => `paragraph ${String(index)} with some words`,
    ).join("\n\n");
    let renderCount = 0;
    const renderer = (source: string): string => {
      renderCount += 1;
      return renderMarkdown(source);
    };
    const document = textFrom(paragraphs);
    const state = new IncrementalRenderState("doc", 1, 0, document, renderer);
    drain(state, []);
    renderCount = 0;

    const change = ChangeSet.of(
      { from: document.line(100).from + 2, insert: "X" },
      document.length,
    );
    const after = change.apply(document);
    state.applyChange(document, after, 0, 1, change.toJSON());
    drain(state, []);

    expect(renderCount).toBeLessThanOrEqual(3);
  });

  it("AC-R1-10: stays equivalent after line-count changes compact the offsets", () => {
    const initial = textFrom(Array.from(
      { length: 120 },
      (_, index) => `block ${String(index)}`,
    ).join("\n\n"));
    const state = new IncrementalRenderState("doc", 1, 0, initial, renderMarkdown);
    const display: DisplayBlock[] = [];
    drain(state, display);
    let document = initial;
    let version = 0;
    for (let step = 0; step < 80; step += 1) {
      // Each edit moves down the document, so the pending line offsets grow.
      let number = 1;
      while (number <= document.lines &&
        document.line(number).text !== `block ${String(step)}`) {
        number += 1;
      }
      const change = ChangeSet.of(
        { from: document.line(number).from + 6, insert: "\n" },
        document.length,
      );
      const after = change.apply(document);
      state.applyChange(document, after, version, version + 1, change.toJSON());
      version += 1;
      document = after;
      takePatch(state.patch(), display);
    }

    expect(withoutDataLines(display.map((block) => block.html).join("")))
      .toBe(withoutDataLines(renderMarkdown(document.toString())));
  });

  it("AC-R1-10: a keystroke on a 10,000-block document touches few chunk records", () => {
    const blocks = 10_000;
    const source = Array.from(
      { length: blocks },
      (_, index) => `block ${String(index)} has some words in it`,
    ).join("\n\n");
    const document = textFrom(source);
    const state = new IncrementalRenderState("doc", 1, 0, document, () => "");
    drain(state, []);

    const line = 2 * 5_000;
    const change = ChangeSet.of(
      { from: document.line(line).from + 4, insert: "\n" },
      document.length,
    );
    const after = change.apply(document);
    const before = state.chunkLineWrites;
    state.applyChange(document, after, 0, 1, change.toJSON());
    expect(after.lines).toBe(document.lines + 1);
    // One replacement split into two chunks: no chunk after the change may be
    // rewritten by the line-count shift.
    expect(state.chunkLineWrites - before).toBeLessThanOrEqual(4);
  });
});
