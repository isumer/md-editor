import { describe, expect, it } from "vitest";

import { CompareWorkerHandler } from "../../src/renderer/features/compare/worker";
import {
  MAX_COMPARE_TEXT_LENGTH,
  type CompareWorkerResponse,
} from "../../src/shared/workers/compare";

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

describe("compare worker", () => {
  it("AC-R14-01 AC-R14-02: returns a typed compare result for one request", () => {
    const responses: CompareWorkerResponse[] = [];
    const handler = new CompareWorkerHandler((response) => responses.push(response));

    handler.handle({ id: 4, left: "old word", right: "new word", highlight: "words" });

    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({
      id: 4,
      ok: true,
      state: { changeCount: 1, highlight: "words" },
    });
  });

  it("rejects non-objects, wrong keys, wrong types and prototype keys", () => {
    const responses: CompareWorkerResponse[] = [];
    const handler = new CompareWorkerHandler((response) => responses.push(response));

    for (const request of [
      null,
      "compare",
      [],
      { id: 1, left: "left", right: "right" },
      { id: 1, left: "left", right: "right", highlight: "words", extra: true },
      { id: "1", left: "left", right: "right", highlight: "words" },
      { id: 1, left: 1, right: "right", highlight: "words" },
      { id: 1, left: "left", right: false, highlight: "words" },
      { id: 1, left: "left", right: "right", highlight: "pixels" },
      withOwnProto({ id: 1, left: "left", right: "right", highlight: "words" }),
    ]) {
      handler.handle(request);
    }

    expect(responses).toEqual([]);
  });

  it("rejects oversized compare text", () => {
    const responses: CompareWorkerResponse[] = [];
    const handler = new CompareWorkerHandler((response) => responses.push(response));
    const half = "x".repeat((MAX_COMPARE_TEXT_LENGTH / 2) + 1);

    handler.handle({
      id: 1,
      left: half + half,
      right: "right",
      highlight: "words",
    });

    expect(responses).toEqual([]);
  });

  it("returns a typed error when compare state creation fails", () => {
    const responses: CompareWorkerResponse[] = [];
    const handler = new CompareWorkerHandler(
      (response) => responses.push(response),
      () => { throw new Error("failed"); },
    );

    handler.handle({ id: 8, left: "left", right: "right", highlight: "words" });

    expect(responses).toEqual([{ id: 8, ok: false, message: "failed" }]);
  });
});
