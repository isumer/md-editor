import { describe, expect, it } from "vitest";

import {
  CompareWorkerHandler,
  type CompareWorkerResponse,
} from "../../src/renderer/features/compare/worker";

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

  it("returns a typed error when compare state creation fails", () => {
    const responses: CompareWorkerResponse[] = [];
    const handler = new CompareWorkerHandler((response) => responses.push(response));
    const request = {
      id: 8,
      get left(): string {
        throw new Error("failed");
      },
      right: "right",
      highlight: "words",
    } as const;

    handler.handle(request);

    expect(responses).toEqual([{ id: 8, ok: false, message: "failed" }]);
  });
});
