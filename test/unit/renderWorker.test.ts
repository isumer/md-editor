import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/render", async (importOriginal) => {
  const renderer = await importOriginal<typeof import("../../src/renderer/render")>();
  return { renderMarkdown: vi.fn(renderer.renderMarkdown) };
});

import { renderMarkdown } from "../../src/renderer/render";

const renderMarkdownMock = vi.mocked(renderMarkdown);

beforeEach(() => {
  vi.resetModules();
  renderMarkdownMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("render worker", () => {
  it("AC-R1-02: posts successful renders and typed failures", async () => {
    const workerScope = { onmessage: undefined as any, postMessage: vi.fn() };
    vi.stubGlobal("self", workerScope);
    await import("../../src/renderer/render.worker");

    workerScope.onmessage({ data: { id: 1, text: "# Rendered" } });
    expect(workerScope.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      ok: true,
      html: '<h1 data-line="0">Rendered</h1>\n',
    });

    // The real renderer does not throw, so force failures to test the worker transport response.
    renderMarkdownMock.mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    workerScope.onmessage({ data: { id: 2, text: "broken" } });
    expect(workerScope.postMessage).toHaveBeenLastCalledWith({
      id: 2,
      ok: false,
      message: "render failed",
    });

    renderMarkdownMock.mockImplementationOnce(() => {
      throw "string failure";
    });
    workerScope.onmessage({ data: { id: 3, text: "broken again" } });
    expect(workerScope.postMessage).toHaveBeenLastCalledWith({
      id: 3,
      ok: false,
      message: "string failure",
    });
  });
});
