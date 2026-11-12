import { describe, expect, it, vi } from "vitest";

import type {
  MergeWorkerRequest,
  MergeWorkerResponse,
} from "../../src/shared/workers/merge";
import { isMergeWorkerRequest } from "../../src/shared/workers/merge";
import { MergeWorkerHandler } from "../../src/renderer/features/merge/worker";
import {
  MergeWorkerClient,
  type MergeWorkerPort,
} from "../../src/renderer/features/merge/workerClient";

function request(id = 1): MergeWorkerRequest {
  return { id, base: "base\n", left: "left\n", right: "right\n" };
}

function port(): MergeWorkerPort {
  return {
    onerror: null,
    onmessage: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
}

describe("merge worker contract", () => {
  it("accepts only exact bounded merge requests", () => {
    expect(isMergeWorkerRequest(request())).toBe(true);
    expect(isMergeWorkerRequest({ ...request(), extra: true })).toBe(false);
    expect(isMergeWorkerRequest({ ...request(), id: -1 })).toBe(false);
    expect(isMergeWorkerRequest({ ...request(), base: 4 })).toBe(false);
    expect(isMergeWorkerRequest(null)).toBe(false);
    const accessor = Object.defineProperty(
      { base: "", left: "", right: "" },
      "id",
      { enumerable: true, get: () => 1 },
    );
    expect(isMergeWorkerRequest(accessor)).toBe(false);
  });

  it("returns a typed merge result", () => {
    const post = vi.fn();
    const result = {
      base: "base\n",
      chunks: [],
      conflictCount: 0,
      left: "left\n",
      right: "right\n",
    };
    const handler = new MergeWorkerHandler(post, vi.fn(() => result));

    handler.handle(request());

    expect(post).toHaveBeenCalledWith({ id: 1, ok: true, result });
  });

  it("returns a typed error when merge computation fails", () => {
    const post = vi.fn();
    const handler = new MergeWorkerHandler(post, () => {
      throw new Error("merge failed");
    });

    handler.handle(request());

    expect(post).toHaveBeenCalledWith({ id: 1, ok: false, message: "merge failed" });
  });

  it("ignores invalid input and serializes non-error failures", () => {
    const post = vi.fn();
    const handler = new MergeWorkerHandler(post, () => {
      throw "merge failed";
    });

    handler.handle({ bad: true });
    handler.handle(request());

    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith({ id: 1, ok: false, message: "merge failed" });
  });
});

describe("merge worker client", () => {
  it("discards a reply after a newer request starts", () => {
    const worker = port();
    const receiveFirst = vi.fn();
    const receiveSecond = vi.fn();
    const client = new MergeWorkerClient(() => worker, vi.fn(), "worker failed");
    client.request(request(), receiveFirst);
    client.request(request(), receiveSecond);
    const result = { base: "", chunks: [], conflictCount: 0, left: "", right: "" };

    worker.onmessage?.({ data: { id: 1, ok: true, result } } as MessageEvent);
    worker.onmessage?.({ data: { id: 2, ok: true, result } } as MessageEvent);

    expect(receiveFirst).not.toHaveBeenCalled();
    expect(receiveSecond).toHaveBeenCalledWith(result);
  });

  it("reports typed errors without delivering a result", () => {
    const worker = port();
    const showError = vi.fn();
    const receive = vi.fn();
    const client = new MergeWorkerClient(() => worker, showError, "worker failed");
    client.request(request(), receive);

    const response: MergeWorkerResponse = { id: 1, ok: false, message: "bad merge" };
    worker.onmessage?.({ data: response } as MessageEvent);

    expect(showError).toHaveBeenCalledWith("bad merge");
    expect(receive).not.toHaveBeenCalled();
  });

  it("terminates a failed worker and starts a replacement", () => {
    const first = port();
    const second = port();
    const showError = vi.fn();
    const createWorker = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const client = new MergeWorkerClient(createWorker, showError, "worker failed");
    client.request(request(), vi.fn());

    first.onerror?.({} as ErrorEvent);
    client.request(request(), vi.fn());

    expect(showError).toHaveBeenCalledWith("worker failed");
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("reports a worker creation failure", () => {
    const showError = vi.fn();
    const client = new MergeWorkerClient(
      () => {
        throw "worker unavailable";
      },
      showError,
      "worker failed",
    );

    client.request(request(), vi.fn());

    expect(showError).toHaveBeenCalledWith("worker unavailable");
  });
});
