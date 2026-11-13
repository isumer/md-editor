// @vitest-environment jsdom
/* eslint-disable max-lines -- Sync-scroll scenarios share one stateful DOM fixture. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncScrollController } from "../../src/renderer/features/sync-scroll/controller";

function rect(top: number, height: number): DOMRect {
  return {
    top, height, bottom: top + height, left: 0, right: 800, width: 800,
    x: 0, y: top, toJSON: () => ({}),
  };
}

interface PageFixture {
  height: number;
  readonly line: number;
}

function setup(initial: readonly PageFixture[] = [
  { line: 1, height: 100 },
  { line: 10, height: 200 },
  { line: 20, height: 240 },
], initialBlockCount = 1, isActive: () => boolean = () => true) {
  document.body.innerHTML = `<div id="editor"></div><div id="preview"></div>`;
  const editorScroll = document.querySelector<HTMLElement>("#editor");
  const preview = document.querySelector<HTMLElement>("#preview");
  if (editorScroll === null || preview === null) throw new Error("Missing scroll test element");
  let insideFrame = false;
  let layoutReadCount = 0;
  const recordLayoutRead = (): void => {
    if (insideFrame) layoutReadCount += 1;
  };
  Object.defineProperties(preview, {
    clientHeight: { get: () => { recordLayoutRead(); return 200; }, configurable: true },
    scrollHeight: { get: () => { recordLayoutRead(); return 1_000; }, configurable: true },
  });
  vi.spyOn(preview, "getBoundingClientRect").mockImplementation(() => {
    recordLayoutRead();
    return rect(0, 200);
  });
  const root = document.createElement("div");
  root.className = "preview-document";
  preview.append(root);
  const pages: PageFixture[] = [];
  let blockRectCount = 0;
  let pageRectCount = 0;
  const addPage = (fixture: PageFixture, blockCount = 1): void => {
    const page = document.createElement("div");
    page.className = "preview-page";
    pages.push(fixture);
    vi.spyOn(page, "getBoundingClientRect").mockImplementation(() => {
      recordLayoutRead();
      pageRectCount += 1;
      const index = pages.indexOf(fixture);
      const top = pages.slice(0, index).reduce((sum, item) => sum + item.height, 0);
      return rect(top - preview.scrollTop, fixture.height);
    });
    const querySelectorAll = page.querySelectorAll.bind(page);
    vi.spyOn(page, "querySelectorAll").mockImplementation((selectors: string) => {
      recordLayoutRead();
      return querySelectorAll(selectors);
    });
    for (let index = 0; index < blockCount; index += 1) {
      const block = document.createElement("div");
      block.className = "preview-block";
      block.dataset["line"] = String(fixture.line + index - 1);
      vi.spyOn(block, "getBoundingClientRect").mockImplementation(() => {
        recordLayoutRead();
        blockRectCount += 1;
        const pageIndex = pages.indexOf(fixture);
        const pageTop = pages.slice(0, pageIndex).reduce((sum, item) => sum + item.height, 0);
        const blockHeight = fixture.height / blockCount;
        return rect(pageTop + index * blockHeight - preview.scrollTop, blockHeight);
      });
      page.append(block);
    }
    root.append(page);
  };
  for (const fixture of initial) addPage(fixture, initialBlockCount);
  const frames: FrameRequestCallback[] = [];
  const scrollEditorToLine = vi.fn();
  let editorLine = 10;
  const controller = new SyncScrollController({
    blockLine: (element) => Number(element.dataset["line"]),
    editorScroll,
    isActive,
    preview,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    sourceLineAtEditorTop: () => editorLine,
    scrollEditorToLine,
  });
  const flush = (): void => {
    const pending = frames.splice(0);
    for (const frame of pending) {
      insideFrame = true;
      try {
        frame(16);
      } finally {
        insideFrame = false;
      }
    }
  };
  flush();
  return {
    addPage,
    blockRects: () => blockRectCount,
    controller,
    editorScroll,
    frameCount: () => frames.length,
    flush,
    layoutReads: () => layoutReadCount,
    pageRects: () => pageRectCount,
    pages,
    preview,
    root,
    scrollEditorToLine,
    setEditorLine: (line: number) => { editorLine = line; },
  };
}

describe("sync scroll controller", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

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

  it("AC-R3-02: maps preview scrolling within the final page", () => {
    const { flush, preview, scrollEditorToLine } = setup([
      { line: 20, height: 200 },
    ], 10);
    preview.scrollTop = 100;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(25);
  });

  it("AC-R3-01: maps editor scrolling within the final page", () => {
    const { editorScroll, flush, preview, setEditorLine } = setup([
      { line: 20, height: 200 },
    ], 10);
    setEditorLine(25);
    editorScroll.dispatchEvent(new Event("scroll"));
    flush();
    expect(preview.scrollTop).toBe(100);
  });

  it("AC-R3-01: uses a terminal anchor when final-page blocks have no layout", () => {
    const state = setup([{ line: 20, height: 200 }], 10);
    for (const block of state.preview.querySelectorAll<HTMLElement>(".preview-block")) {
      vi.mocked(block.getBoundingClientRect).mockReturnValue(rect(0, 0));
    }
    state.setEditorLine(25);
    state.editorScroll.dispatchEvent(new Event("scroll"));
    state.flush();
    expect(state.preview.scrollTop).toBe(100);
  });

  it("AC-R3-02: refreshes and reapplies anchors during a steady fill", async () => {
    vi.useFakeTimers();
    const fixtures = [{ line: 1, height: 100 }, { line: 10, height: 100 }];
    const { addPage, flush, preview, scrollEditorToLine } = setup(fixtures);
    preview.dataset["renderComplete"] = "false";
    preview.scrollTop = 150;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenLastCalledWith(10);

    const firstFixture = fixtures[0];
    const secondFixture = fixtures[1];
    const pageElements = preview.querySelectorAll<HTMLElement>(".preview-page");
    const firstPage = pageElements.item(0);
    const secondPage = pageElements.item(1);
    if (firstFixture === undefined || secondFixture === undefined) {
      throw new Error("Missing fill fixtures");
    }
    firstFixture.height = 200;
    firstPage?.append(document.createElement("span"));
    addPage({ line: 20, height: 100 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);
    secondFixture.height = 300;
    secondPage?.append(document.createElement("span"));
    addPage({ line: 30, height: 100 });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(50);
    flush();

    expect(scrollEditorToLine).toHaveBeenLastCalledWith(8);
  });

  it("AC-R3-02: a repeated layout refresh does not move the editor again", () => {
    const { flush, pages, preview, scrollEditorToLine } = setup();
    preview.scrollTop = 150;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenLastCalledWith(13);

    const firstPage = pages[0];
    const secondPage = pages[1];
    if (firstPage === undefined || secondPage === undefined) {
      throw new Error("Missing page fixtures");
    }
    firstPage.height = 200;
    secondPage.height = 300;
    preview.dispatchEvent(new Event("contentvisibilityautostatechange"));
    preview.dispatchEvent(new Event("contentvisibilityautostatechange"));
    flush();
    expect(scrollEditorToLine).toHaveBeenLastCalledWith(8);
    preview.dispatchEvent(new Event("contentvisibilityautostatechange"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledTimes(2);
  });

  it("AC-R3-02: unchanged page heights keep the mapping", () => {
    const { flush, preview, scrollEditorToLine } = setup();
    preview.scrollTop = 150;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    preview.dispatchEvent(new Event("contentvisibilityautostatechange"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(13);
  });

  it("scroll uses cached page geometry without measuring pages or blocks", async () => {
    const fixtures = Array.from({ length: 64 }, (_, index) => ({
      line: index * 20 + 1,
      height: 100,
    }));
    const state = setup([]);
    for (const fixture of fixtures) state.addPage(fixture, 20);
    await Promise.resolve();
    state.flush();
    const pagesBefore = state.pageRects();
    const blocksBefore = state.blockRects();
    state.preview.scrollTop = 3_000;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();
    expect(state.pageRects() - pagesBefore).toBe(0);
    expect(state.blockRects() - blocksBefore).toBe(0);
  });

  it("scroll callbacks use only cached geometry when a page refresh is pending", () => {
    const state = setup();
    const page = state.root.querySelector<HTMLElement>(".preview-page");
    if (page === null) throw new Error("Missing preview page");
    page.dispatchEvent(new Event("contentvisibilityautostatechange", { bubbles: true }));
    const readsBefore = state.layoutReads();

    state.preview.scrollTop = 150;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.layoutReads() - readsBefore).toBe(0);
  });

  it("a changed cached page shifts the geometry after it", async () => {
    vi.useFakeTimers();
    const fixtures = Array.from({ length: 101 }, (_, index) => ({
      line: index * 10 + 1,
      height: 100,
    }));
    const state = setup([]);
    for (const fixture of fixtures) state.addPage(fixture);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    state.flush();
    const pages = state.root.querySelectorAll<HTMLElement>(".preview-page");
    const firstFixture = fixtures[0];
    const firstPage = pages.item(0);
    if (firstFixture === undefined || firstPage === null) throw new Error("Missing first page");
    firstFixture.height = 200;
    firstPage.append(document.createElement("span"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);
    state.flush();
    const pageReads = state.pageRects();
    firstPage.dispatchEvent(new Event("contentvisibilityautostatechange", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    state.flush();

    expect(state.pageRects()).toBeGreaterThan(pageReads);
  });

  it("refresh uses visible blocks when the preview has no pages", () => {
    const { controller, flush, preview, root, scrollEditorToLine } = setup([]);
    const hidden = document.createElement("div");
    hidden.className = "preview-block";
    hidden.dataset["line"] = "0";
    vi.spyOn(hidden, "getBoundingClientRect").mockReturnValue(rect(0, 0));
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = "9";
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rect(100, 40));
    root.append(hidden, block);
    controller.refreshAnchors();
    preview.scrollTop = 100;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("orders block anchors that share a top by source line", () => {
    const { controller, flush, preview, root, scrollEditorToLine } = setup([]);
    const later = document.createElement("div");
    later.className = "preview-block";
    later.dataset["line"] = "9";
    vi.spyOn(later, "getBoundingClientRect").mockReturnValue(rect(100, 40));
    const earlier = document.createElement("div");
    earlier.className = "preview-block";
    earlier.dataset["line"] = "4";
    vi.spyOn(earlier, "getBoundingClientRect").mockReturnValue(rect(100, 40));
    root.append(later, earlier);

    controller.refreshAnchors();
    preview.scrollTop = 100;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(5);
  });

  it("maps editor scrolling through block anchors when pages are absent", () => {
    const { controller, editorScroll, flush, preview, root, setEditorLine } = setup([]);
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = "9";
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rect(100, 40));
    root.append(block);
    controller.refreshAnchors();
    setEditorLine(10);
    editorScroll.dispatchEvent(new Event("scroll"));
    flush();
    expect(preview.scrollTop).toBe(100);
  });

  it("keeps page order after pages move or are removed", async () => {
    const state = setup();
    const pageElements = [...state.root.querySelectorAll<HTMLElement>(".preview-page")];
    const first = pageElements[0];
    const second = pageElements[1];
    const third = pageElements[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Missing page elements");
    }
    const inserted = document.createElement("div");
    inserted.className = "preview-page";
    vi.spyOn(inserted, "getBoundingClientRect").mockReturnValue(rect(100, 100));
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = "4";
    inserted.append(block);
    state.root.insertBefore(inserted, second);
    state.root.append(third);
    second.remove();
    state.root.append(document.createTextNode("fill"));
    await Promise.resolve();

    state.preview.scrollTop = 0;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.scrollEditorToLine).toHaveBeenCalledWith(1);
  });

  it("skips an empty final page while finding an editor line", async () => {
    const state = setup([]);
    state.addPage({ line: 10, height: 100 });
    const empty = document.createElement("div");
    empty.className = "preview-page";
    state.root.append(empty);
    await Promise.resolve();

    state.setEditorLine(10);
    state.editorScroll.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.preview.scrollTop).toBe(0);
  });

  it("scroll ignores empty and hidden pages", async () => {
    const { flush, preview, root, scrollEditorToLine } = setup([]);
    const empty = document.createElement("div");
    empty.className = "preview-page";
    vi.spyOn(empty, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const hidden = document.createElement("div");
    hidden.className = "preview-page";
    vi.spyOn(hidden, "getBoundingClientRect").mockReturnValue(rect(100, 0));
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = "9";
    hidden.append(block);
    root.append(empty, hidden);
    await Promise.resolve();

    preview.scrollTop = 100;
    preview.dispatchEvent(new Event("scroll"));
    flush();

    expect(scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("caches empty pages and a hidden final page without anchors", async () => {
    const state = setup([]);
    const empty = document.createElement("div");
    empty.className = "preview-page";
    vi.spyOn(empty, "getBoundingClientRect").mockReturnValue(rect(0, 100));
    const hidden = document.createElement("div");
    hidden.className = "preview-page";
    vi.spyOn(hidden, "getBoundingClientRect").mockReturnValue(rect(100, 0));
    for (const line of [9, 19]) {
      const block = document.createElement("div");
      block.className = "preview-block";
      block.dataset["line"] = String(line);
      vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rect(100, 0));
      hidden.append(block);
    }
    state.root.append(empty, hidden);
    await Promise.resolve();
    state.controller.refreshAnchors();
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("uses the browser frame and resize observers by default", async () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    let resizeCallback: ResizeObserverCallback | null = null;
    const disconnect = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      disconnect = disconnect;
      observe = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    document.body.innerHTML = `<div id="editor"></div><div id="preview"></div>`;
    const editorScroll = document.querySelector<HTMLElement>("#editor");
    const preview = document.querySelector<HTMLElement>("#preview");
    if (editorScroll === null || preview === null) throw new Error("Missing observer elements");
    const controller = new SyncScrollController({
      blockLine: () => 0,
      editorScroll,
      preview,
      sourceLineAtEditorTop: () => 1,
      scrollEditorToLine: vi.fn(),
    });
    const callback = resizeCallback as ResizeObserverCallback | null;
    if (callback === null) throw new Error("Missing resize observer callback");

    callback([], {} as ResizeObserver);
    callback([], {} as ResizeObserver);
    await vi.advanceTimersByTimeAsync(100);
    for (const frame of frames.splice(0)) frame(16);
    controller.dispose();

    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("later pages cannot reapply an old preview target after a document switch", async () => {
    const { flush, frameCount, preview, scrollEditorToLine } = setup();
    preview.scrollTop = 100;
    preview.dispatchEvent(new Event("scroll"));
    flush();
    expect(scrollEditorToLine).toHaveBeenCalledOnce();
    flush();
    scrollEditorToLine.mockClear();
    const replacement = document.createElement("div");
    replacement.className = "preview-document";
    preview.dataset["renderComplete"] = "true";
    preview.replaceChildren(replacement);
    await Promise.resolve();
    preview.scrollTop = 200;
    preview.dispatchEvent(new Event("scroll"));
    expect(frameCount()).toBe(1);
    flush();

    const page = document.createElement("div");
    page.className = "preview-page";
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(rect(0, 200));
    const block = document.createElement("div");
    block.className = "preview-block";
    block.dataset["line"] = "39";
    page.append(block);
    replacement.append(page);
    await Promise.resolve();
    flush();
    expect(scrollEditorToLine).not.toHaveBeenCalled();
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

  it("AC-R3-03: suppresses a synchronized preview event delayed across frames", () => {
    const { editorScroll, flush, preview, scrollEditorToLine } = setup();
    editorScroll.dispatchEvent(new Event("scroll"));
    flush();
    flush();

    preview.dispatchEvent(new Event("scroll"));
    flush();

    expect(scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("AC-R3-03: suppresses a synchronized editor event delayed across frames", () => {
    const state = setup();
    state.preview.scrollTop = 100;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();
    state.flush();

    state.editorScroll.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.frameCount()).toBe(0);
    expect(state.scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("AC-R2-01: a queued preview sync cannot move the editor after split view closes", () => {
    let active = true;
    const state = setup(undefined, 1, () => active);
    state.preview.scrollTop = 100;
    state.preview.dispatchEvent(new Event("scroll"));

    active = false;
    state.flush();

    expect(state.scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("AC-R2-01: a queued editor sync cannot move the preview after split view closes", () => {
    let active = true;
    const state = setup(undefined, 1, () => active);
    state.setEditorLine(20);
    state.editorScroll.dispatchEvent(new Event("scroll"));

    active = false;
    state.flush();

    expect(state.preview.scrollTop).toBe(0);
  });

  it("AC-R2-01: closing split view cancels a queued preview layout refresh", () => {
    let active = true;
    const state = setup(undefined, 1, () => active);
    const readsBeforeRefresh = state.layoutReads();
    state.preview.dispatchEvent(new Event("contentvisibilityautostatechange"));

    active = false;
    state.flush();

    expect(state.layoutReads()).toBe(readsBeforeRefresh);
  });

  it("AC-R2-01: an editor interaction ignores a non-interactive preview scroll", () => {
    const state = setup();
    state.editorScroll.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    state.preview.scrollTop = 100;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.scrollEditorToLine).not.toHaveBeenCalled();
  });

  it("AC-R2-01: a preview interaction restores preview-driven synchronization", () => {
    const state = setup();
    state.editorScroll.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    state.preview.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    state.preview.scrollTop = 100;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("AC-R3-04: disables synchronization and saves the setting", () => {
    const { controller, editorScroll, flush, preview } = setup();
    controller.refreshAnchors();
    controller.toggle();
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

  it("dispose removes listeners and cancels a pending refresh", async () => {
    vi.useFakeTimers();
    const { addPage, controller, editorScroll, pageRects, preview } = setup();
    preview.dataset["renderComplete"] = "false";
    addPage({ line: 30, height: 100 });
    await Promise.resolve();
    const measured = pageRects();
    const page = preview.querySelector<HTMLElement>(".preview-page");
    page?.dispatchEvent(new Event("contentvisibilityautostatechange", { bubbles: true }));

    controller.dispose();
    editorScroll.dispatchEvent(new Event("scroll"));
    preview.dispatchEvent(new Event("scroll"));
    preview.dispatchEvent(new Event("contentvisibilityautostatechange"));
    await vi.advanceTimersByTimeAsync(100);

    expect(pageRects()).toBe(measured);
  });

  it("ignores a visibility event from a non-element target", () => {
    const state = setup();
    const text = document.createTextNode("fill");
    state.root.append(text);

    text.dispatchEvent(new Event("contentvisibilityautostatechange", { bubbles: true }));
    state.preview.scrollTop = 100;
    state.preview.dispatchEvent(new Event("scroll"));
    state.flush();

    expect(state.scrollEditorToLine).toHaveBeenCalledExactlyOnceWith(10);
  });
});
