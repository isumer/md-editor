// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncScrollController } from "../../src/renderer/features/sync-scroll/controller";

function rect(top: number, height: number): DOMRect {
  return {
    top, height, bottom: top + height, left: 0, right: 800, width: 800,
    x: 0, y: top, toJSON: () => ({}),
  };
}

function setup() {
  document.body.innerHTML = `<div id="editor"></div><div id="preview"></div>`;
  const editorScroll = document.querySelector<HTMLElement>("#editor");
  const preview = document.querySelector<HTMLElement>("#preview");
  if (editorScroll === null || preview === null) throw new Error("Missing scroll test element");
  Object.defineProperties(preview, {
    clientHeight: { value: 200, configurable: true },
    scrollHeight: { value: 1_000, configurable: true },
  });
  vi.spyOn(preview, "getBoundingClientRect").mockReturnValue(rect(0, 200));
  for (const [line, top] of [[1, 0], [10, 100], [20, 300]] as const) {
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = String(line - 1);
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rect(top, 40));
    preview.append(block);
  }
  const frames: FrameRequestCallback[] = [];
  const scrollEditorToLine = vi.fn();
  let editorLine = 10;
  const controller = new SyncScrollController({
    blockLine: (element) => Number(element.dataset["line"]),
    editorScroll,
    preview,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    sourceLineAtEditorTop: () => editorLine,
    scrollEditorToLine,
  });
  const flush = () => {
    const pending = frames.splice(0);
    for (const frame of pending) frame(16);
  };
  flush();
  return {
    controller, editorScroll, flush, preview, scrollEditorToLine,
    setEditorLine: (line: number) => { editorLine = line; },
  };
}

describe("sync scroll controller", () => {
  beforeEach(() => localStorage.clear());

  it("AC-R3-01: maps the editor top line to the preview once per frame", () => {
    const { controller, editorScroll, flush, preview, setEditorLine } = setup();
    controller.refreshAnchors();
    setEditorLine(20);

    editorScroll.dispatchEvent(new Event("scroll"));
    editorScroll.dispatchEvent(new Event("scroll"));
    flush();

    expect(preview.scrollTop).toBe(300);
  });

  it("AC-R3-02: maps the preview top to the editor source line", () => {
    const { controller, flush, preview, scrollEditorToLine } = setup();
    controller.refreshAnchors();
    preview.scrollTop = 100;

    preview.dispatchEvent(new Event("scroll"));
    flush();

    expect(scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("AC-R3-03: suppresses the reverse scroll caused by synchronization", () => {
    const { controller, editorScroll, flush, preview, scrollEditorToLine } = setup();
    controller.refreshAnchors();

    editorScroll.dispatchEvent(new Event("scroll"));
    flush();
    preview.dispatchEvent(new Event("scroll"));
    flush();

    expect(scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("AC-R3-04: disables synchronization and saves the setting", () => {
    const { controller, editorScroll, flush, preview } = setup();
    controller.refreshAnchors();
    controller.setEnabled(false);
    editorScroll.dispatchEvent(new Event("scroll"));
    flush();

    expect(preview.scrollTop).toBe(0);
    expect(localStorage.getItem("syncScroll.enabled")).toBe("false");
  });

  it("AC-R3-04: restores the disabled setting", () => {
    localStorage.setItem("syncScroll.enabled", "false");

    const { controller } = setup();

    expect(controller.isEnabled).toBe(false);
  });
});
