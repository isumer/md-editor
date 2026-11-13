// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { syncScrollFeature } from "../../src/renderer/features/list";

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function installSyncScroll() {
  const editorScroll = document.createElement("div");
  const preview = document.createElement("div");
  const workspace = document.createElement("main");
  workspace.dataset["viewMode"] = "split";
  workspace.append(editorScroll, preview);
  document.body.append(workspace);
  const hooks = syncScrollFeature.create({
    editor: { scrollDOM: editorScroll },
    preview,
    workspace,
  } as unknown as Parameters<typeof syncScrollFeature.create>[0]);
  return hooks;
}

it("AC-R3-04: the feature command toggles sync scroll", () => {
  const hooks = installSyncScroll();

  hooks.commands?.["view.syncScroll"]?.();

  expect(localStorage.getItem("syncScroll.enabled")).toBe("false");
});

function installBidirectionalSync() {
  const editorScroll = document.createElement("div");
  const preview = document.createElement("div");
  const workspace = document.createElement("main");
  workspace.dataset["viewMode"] = "split";
  const page = document.createElement("div");
  page.className = "preview-page";
  const block = document.createElement("div");
  block.className = "preview-block";
  block.dataset["line"] = "9";
  page.append(block);
  preview.append(page);
  workspace.append(editorScroll, preview);
  document.body.append(workspace);
  Object.defineProperties(preview, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 200 },
  });
  vi.spyOn(preview, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  vi.spyOn(block, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  const lineBlockAt = vi.fn(() => ({ top: 75 }));
  syncScrollFeature.create({
    editor: {
      documentPadding: { top: 5 },
      documentTop: 0,
      lineBlockAt,
      lineBlockAtHeight: () => ({ from: 90 }),
      scrollDOM: editorScroll,
      state: {
        doc: {
          line: (line: number) => ({ from: line * 10 }),
          lineAt: () => ({ number: 10 }),
          lines: 20,
        },
      },
    },
    preview,
    workspace,
  } as unknown as Parameters<typeof syncScrollFeature.create>[0]);
  return { editorScroll, lineBlockAt, preview };
}

function flushFrames(frames: FrameRequestCallback[], time: number): void {
  for (const frame of frames.splice(0)) frame(time);
}

it("AC-R3-01 AC-R3-02: the feature wires both scroll directions", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const { editorScroll, lineBlockAt, preview } = installBidirectionalSync();
  flushFrames(frames, 0);

  editorScroll.dispatchEvent(new Event("scroll"));
  flushFrames(frames, 16);
  preview.dispatchEvent(new MouseEvent("pointerdown"));
  preview.scrollTop = 50;
  preview.dispatchEvent(new Event("scroll"));
  flushFrames(frames, 32);

  expect(preview.scrollTop).toBe(50);
  expect(lineBlockAt).toHaveBeenCalledWith(100);
  expect(editorScroll.scrollTop).toBe(80);
});
