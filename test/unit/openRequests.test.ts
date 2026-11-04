import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { OpenRequests } from "../../src/main/app/startup";

describe("open requests", () => {
  it("AC-R9-03: delivers requests received before renderer readiness in order", async () => {
    const delivered: string[] = [];
    const requests = new OpenRequests({
      deliver: async (filePath) => { delivered.push(filePath); },
      isFile: async () => true,
    });

    await requests.enqueueArguments(["first.md", "second.md"], path.join("sender", "cwd"));
    await requests.enqueueFile(path.join("sender", "cwd", "third.md"));
    expect(delivered).toEqual([]);

    await requests.setRendererReady();
    expect(delivered).toEqual([
      path.resolve(path.join("sender", "cwd"), "first.md"),
      path.resolve(path.join("sender", "cwd"), "second.md"),
      path.resolve(path.join("sender", "cwd"), "third.md"),
    ]);
  });

  it("AC-R9-03: resolves relative paths against the sender cwd", async () => {
    const deliver = vi.fn(async () => undefined);
    const requests = new OpenRequests({ deliver, isFile: async () => true });
    await requests.setRendererReady();

    await requests.enqueueArguments([path.join("notes", "today.md")], path.join("other", "launch"));

    expect(deliver).toHaveBeenCalledWith(
      path.resolve(path.join("other", "launch"), "notes", "today.md"),
    );
  });

  it("AC-R9-03: ignores flags and arguments that are not files", async () => {
    const deliver = vi.fn(async () => undefined);
    const isFile = vi.fn(async (candidate: string) => candidate.endsWith("note.md"));
    const requests = new OpenRequests({ deliver, isFile });
    await requests.setRendererReady();

    await requests.enqueueArguments(["--inspect", "workspace", "note.md"], path.join("sender", "cwd"));

    expect(isFile).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith(path.resolve(path.join("sender", "cwd"), "note.md"));
    await requests.enqueueFile(path.join("sender", "cwd", "workspace"));
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("AC-R9-03: continues accepting requests after a delivery failure", async () => {
    const deliver = vi.fn()
      .mockRejectedValueOnce(new Error("renderer unavailable"))
      .mockResolvedValueOnce(undefined);
    const requests = new OpenRequests({ deliver, isFile: async () => true });
    await requests.setRendererReady();

    await expect(requests.enqueueFile("first.md")).rejects.toThrow("renderer unavailable");
    await expect(requests.enqueueFile("second.md")).resolves.toBeUndefined();

    expect(deliver).toHaveBeenCalledTimes(2);
  });
});
