import { afterEach, describe, expect, it, vi } from "vitest";

import type { HtmlExportInput } from "../../src/renderer/features/export/html";

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

async function loadWorker(): Promise<WorkerScope> {
  const scope: WorkerScope = { onmessage: null, postMessage: vi.fn() };
  vi.resetModules();
  vi.stubGlobal("self", scope);
  await import("../../src/renderer/features/export/export.worker");
  return scope;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTML export worker entry", () => {
  it("AC-R6-05: posts the assembled HTML back to the client", async () => {
    const scope = await loadWorker();

    scope.onmessage?.({
      data: {
        id: 4,
        input: {
          title: "Document",
          blocks: [{ id: "one", html: "<h1>Heading</h1>" }],
          theme: "light",
          alwaysLight: false,
        },
      },
    });

    expect(scope.postMessage).toHaveBeenCalledWith({
      id: 4,
      ok: true,
      html: expect.stringContaining("<h1>Heading</h1>"),
    });
  });

  it("AC-R6-05: posts an assembly error back to the client", async () => {
    const scope = await loadWorker();

    scope.onmessage?.({ data: { id: 5, input: { title: "Document" } } });

    const reply = scope.postMessage.mock.calls[0]?.[0] as
      { id: number; ok: boolean; message: string };
    expect(reply).toMatchObject({ id: 5, ok: false });
    expect(typeof reply.message).toBe("string");
    expect(reply.message.length).toBeGreaterThan(0);
  });

  it("AC-R6-05: posts a non-Error failure as text", async () => {
    const scope = await loadWorker();
    const input = {
      title: "Document",
      theme: "light",
      alwaysLight: false,
      blocks: {
        map() {
          throw "worker exploded";
        },
      },
    } as unknown as HtmlExportInput;

    scope.onmessage?.({ data: { id: 6, input } });

    expect(scope.postMessage).toHaveBeenCalledWith({
      id: 6,
      ok: false,
      message: "worker exploded",
    });
  });
});
