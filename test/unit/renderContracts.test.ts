import { describe, expect, it } from "vitest";

import {
  isRenderWorkerRequest,
  MAX_RENDER_TEXT_LENGTH,
} from "../../src/shared/workers/render";

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

describe("render-worker contracts", () => {
  it("AC-R1-07: accepts only exact versioned render-worker messages", () => {
    const change = {
      op: "change",
      docId: "doc",
      epoch: 2,
      fromVersion: 4,
      toVersion: 5,
      changes: [3, [0, "inserted"]],
    };

    expect(isRenderWorkerRequest({
      op: "attach",
      docId: "doc",
      epoch: 2,
      version: 4,
      text: "text",
    })).toBe(true);
    expect(isRenderWorkerRequest(change)).toBe(true);
    expect(isRenderWorkerRequest({
      op: "render",
      id: 1,
      docId: "doc",
      epoch: 2,
      version: 5,
    })).toBe(true);
    expect(isRenderWorkerRequest({ op: "detach", docId: "doc" })).toBe(true);

    expect(isRenderWorkerRequest({ ...change, extra: true })).toBe(false);
    expect(isRenderWorkerRequest({ ...change, toVersion: 6 })).toBe(false);
    expect(isRenderWorkerRequest({ ...change, changes: [[1, 2]] })).toBe(false);
    expect(isRenderWorkerRequest(withOwnProto({ ...change }))).toBe(false);
  });

  it("AC-R1-07: rejects unsafe render-worker ids, epochs, and versions", () => {
    const render = {
      op: "render",
      id: 1,
      docId: "doc",
      epoch: 0,
      version: 0,
    };

    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isRenderWorkerRequest({ ...render, id: invalid })).toBe(false);
      expect(isRenderWorkerRequest({ ...render, epoch: invalid })).toBe(false);
      expect(isRenderWorkerRequest({ ...render, version: invalid })).toBe(false);
    }
  });

  it("AC-R1-07: rejects hostile objects without invoking accessors", () => {
    const getter = { op: "detach" };
    Object.defineProperty(getter, "docId", { get: () => "doc" });
    const hostile = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile keys"); },
    });
    const missingDescriptor = new Proxy({}, {
      ownKeys: () => ["op", "docId"],
      getOwnPropertyDescriptor: () => undefined,
    });

    for (const value of [null, "render", [], getter, hostile, missingDescriptor]) {
      expect(isRenderWorkerRequest(value)).toBe(false);
    }
  });

  it("AC-R1-07: rejects malformed and hostile change arrays", () => {
    const base = {
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
    };
    const accessorChanges = [0];
    Object.defineProperty(accessorChanges, "0", { get: () => 0 });
    const extraChanges = [0];
    Object.defineProperty(extraChanges, "extra", { value: true });
    const hostileChanges = new Proxy([], {
      ownKeys: () => { throw new Error("hostile changes"); },
    });
    const missingEntry = new Proxy([], {
      ownKeys: () => ["0", "length"],
      getOwnPropertyDescriptor(target, property) {
        return property === "length"
          ? Object.getOwnPropertyDescriptor(target, property)
          : undefined;
      },
    });

    for (const changes of [{}, [[]], [["bad"]], [[0, 1]], ["bad"],
      accessorChanges, extraChanges, hostileChanges, missingEntry]) {
      expect(isRenderWorkerRequest({ ...base, changes })).toBe(false);
    }
  });

  it("AC-R1-07: rejects oversized snapshots and cumulative insertions", () => {
    const large = "x".repeat(130 * 1024 * 1024);
    const attach = {
      op: "attach",
      docId: "doc",
      epoch: 0,
      version: 0,
      text: large + large,
    };
    const change = {
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [[0, large], [0, large]],
    };

    expect(attach.text.length).toBeGreaterThan(MAX_RENDER_TEXT_LENGTH);
    expect(isRenderWorkerRequest(attach)).toBe(false);
    expect(isRenderWorkerRequest(change)).toBe(false);
  });

  it("AC-R1-07: rejects invalid document ids and snapshot text", () => {
    const attach = {
      op: "attach",
      docId: "doc",
      epoch: 0,
      version: 0,
      text: "text",
    };

    expect(isRenderWorkerRequest({ ...attach, docId: "" })).toBe(false);
    expect(isRenderWorkerRequest({ ...attach, docId: "x".repeat(129) })).toBe(false);
    expect(isRenderWorkerRequest({ ...attach, docId: 1 })).toBe(false);
    expect(isRenderWorkerRequest({ ...attach, text: 1 })).toBe(false);
  });
});
