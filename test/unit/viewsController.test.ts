// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewController } from "../../src/renderer/features/views/viewController";

function fixture(): { divider: HTMLElement; workspace: HTMLElement } {
  document.body.innerHTML = `
    <main id="workspace">
      <aside></aside>
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>`;
  const divider = document.querySelector<HTMLElement>("#divider");
  const workspace = document.querySelector<HTMLElement>("#workspace");
  if (divider === null || workspace === null) throw new Error("Missing view fixture");
  return { divider, workspace };
}

function rect(left: number, width: number): DOMRect {
  return {
    bottom: 600,
    height: 600,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

describe("view controller", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
  });

  it("AC-PERF-03: startup defers pane geometry until after first paint", () => {
    const { divider, workspace } = fixture();
    const editor = document.querySelector<HTMLElement>("#editor");
    const preview = document.querySelector<HTMLElement>("#preview");
    if (editor === null || preview === null) throw new Error("Missing pane fixture");
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(rect(220, 390));
    const measurePreview = vi.spyOn(preview, "getBoundingClientRect");
    measurePreview.mockReturnValue(rect(610, 390));

    new ViewController({
      divider,
      preview,
      skipInitialMeasurement: true,
      workspace,
    });

    try {
      expect(workspace.dataset["viewMode"]).toBe("split");
      expect(measurePreview).not.toHaveBeenCalled();
      frames[0]?.(0);
      expect(measurePreview).not.toHaveBeenCalled();
      frames[1]?.(16);
      expect(workspace.dataset["stablePaneWidths"]).toBe("true");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AC-R2-01: switches modes without replacing pane elements", () => {
    const { divider, workspace } = fixture();
    const editor = document.querySelector("#editor");
    const preview = document.querySelector("#preview");
    const controller = new ViewController({ divider, workspace });

    controller.setMode("editor");
    controller.setMode("preview");
    controller.setMode("split");

    expect(workspace.dataset["viewMode"]).toBe("split");
    expect(document.querySelector("#editor")).toBe(editor);
    expect(document.querySelector("#preview")).toBe(preview);
  });

  it("AC-R2-02: stores a dragged divider and resets it", () => {
    const { divider, workspace } = fixture();
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 1_000,
      top: 0,
      width: 1_000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    new ViewController({ divider, workspace });

    divider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 500 }));
    // 30 % of the pane area (1000 - 220 px) past the sidebar.
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 454 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
    expect(workspace.style.getPropertyValue("--editor-width")).toBe("calc(30% - 66px)");
    expect(localStorage.getItem("view.dividerShare")).toBe("0.3");
    divider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("50%");
    expect(localStorage.getItem("view.dividerShare")).toBe("0.5");
  });

  it("AC-R2-02: a drag resizes the panes past the frozen widths", () => {
    const { divider, workspace } = fixture();
    const editor = document.querySelector<HTMLElement>("#editor");
    const preview = document.querySelector<HTMLElement>("#preview");
    if (editor === null || preview === null) throw new Error("Missing pane fixture");
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue(rect(0, 1_000));
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(rect(220, 390));
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue(rect(610, 390));
    new ViewController({ divider, preview, workspace });
    expect(workspace.dataset["stablePaneWidths"]).toBe("true");

    divider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(workspace.dataset["stablePaneWidths"]).toBeUndefined();

    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 454 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(workspace.dataset["stablePaneWidths"]).toBe("true");
  });

  it("AC-R2-02: restores a valid divider position", () => {
    localStorage.setItem("view.dividerShare", "0.3");
    const { divider, workspace } = fixture();

    new ViewController({ divider, workspace });

    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
  });

  it("AC-R2-02: rejects invalid storage and clamps divider movement", () => {
    localStorage.setItem("view.dividerShare", "0.1");
    const { divider, workspace } = fixture();
    const bounds = vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    new ViewController({ divider, workspace });

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    divider.dispatchEvent(new MouseEvent("pointerdown", { clientX: 900 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900 }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("50%");
    bounds.mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 1_000,
      top: 0,
      width: 1_000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0 }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("20%");
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 1_000 }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("80%");
  });

  it("AC-R2-01: restores pane scroll after layout", () => {
    const { divider, workspace } = fixture();
    const editorScroll = document.createElement("div");
    const preview = document.querySelector<HTMLElement>("#preview");
    if (preview === null) throw new Error("Missing preview fixture");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    editorScroll.scrollTop = 120;
    preview.scrollTop = 80;
    const controller = new ViewController({ divider, editorScroll, preview, workspace });

    controller.setMode("editor");
    editorScroll.scrollTop = 0;
    preview.scrollTop = 0;
    frames.at(-1)?.(0);
    expect(editorScroll.scrollTop).toBe(120);
    expect(preview.scrollTop).toBe(80);
    controller.setMode("preview");
    controller.setMode("split");

    expect(editorScroll.scrollTop).toBe(120);
    expect(preview.scrollTop).toBe(80);
  });

  it("AC-R2-01: restores pane scroll after a second-frame editor measurement", () => {
    const { divider, workspace } = fixture();
    const editorScroll = document.createElement("div");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    editorScroll.scrollTop = 120;
    const controller = new ViewController({ divider, editorScroll, workspace });
    const before = frames.length;

    controller.setMode("editor");
    frames[before]?.(0);
    editorScroll.scrollTop = 0;

    expect(frames).toHaveLength(before + 2);
    frames[before + 1]?.(16);
    expect(editorScroll.scrollTop).toBe(120);
  });

  it("AC-R2-01: restores pane scroll after a third-frame editor measurement", () => {
    const { divider, workspace } = fixture();
    const editorScroll = document.createElement("div");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    editorScroll.scrollTop = 120;
    const controller = new ViewController({ divider, editorScroll, workspace });
    const before = frames.length;

    controller.setMode("editor");
    frames[before]?.(0);
    frames[before + 1]?.(16);
    editorScroll.scrollTop = 0;
    frames[before + 2]?.(32);

    expect(editorScroll.scrollTop).toBe(120);
  });

  it("AC-R2-01: discards a stale second-frame scroll restoration", () => {
    const { divider, workspace } = fixture();
    const editorScroll = document.createElement("div");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    editorScroll.scrollTop = 120;
    const controller = new ViewController({ divider, editorScroll, workspace });
    const first = frames.length;

    controller.setMode("editor");
    frames[first]?.(0);
    const staleSecond = frames[first + 1];
    controller.setMode("preview");
    editorScroll.scrollTop = 0;
    staleSecond?.(16);

    expect(editorScroll.scrollTop).toBe(0);
  });

  it("AC-R2-04: focus mode preserves the selected view mode", async () => {
    const { divider, workspace } = fixture();
    const enterFullScreen = vi.fn(async () => undefined);
    const leaveFullScreen = vi.fn(async () => undefined);
    const controller = new ViewController({
      divider,
      enterFullScreen,
      leaveFullScreen,
      workspace,
    });
    controller.setMode("preview");

    await controller.enterFocusMode();
    expect(document.body.classList.contains("focus-mode")).toBe(true);
    expect(workspace.dataset["viewMode"]).toBe("preview");
    await controller.leaveFocusMode();

    expect(document.body.classList.contains("focus-mode")).toBe(false);
    expect(workspace.dataset["viewMode"]).toBe("preview");
    expect(enterFullScreen).toHaveBeenCalledOnce();
    expect(leaveFullScreen).toHaveBeenCalledOnce();
  });

  it("AC-R2-04: failed full-screen exit keeps focus mode active", async () => {
    const { divider, workspace } = fixture();
    const controller = new ViewController({
      divider,
      enterFullScreen: async () => undefined,
      leaveFullScreen: async () => Promise.reject(new Error("exit failed")),
      workspace,
    });
    await controller.enterFocusMode();

    await expect(controller.leaveFocusMode()).rejects.toThrow("exit failed");

    expect(document.body.classList.contains("focus-mode")).toBe(true);
  });

  it("AC-R2-04: full-screen exit waits for its completion signal", async () => {
    const { divider, workspace } = fixture();
    const fullScreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    let fullScreenElement: Element | null = document.body;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullScreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: () => new Promise<void>(() => undefined),
    });
    try {
      const controller = new ViewController({ divider, workspace });
      document.body.classList.add("focus-mode");
      const leaving = controller.leaveFocusMode();
      document.dispatchEvent(new Event("fullscreenchange"));
      expect(controller.focusMode).toBe(true);
      fullScreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));

      await leaving;

      expect(controller.focusMode).toBe(false);
    } finally {
      if (fullScreenDescriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
      else Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
      if (exitDescriptor === undefined) Reflect.deleteProperty(document, "exitFullscreen");
      else Object.defineProperty(document, "exitFullscreen", exitDescriptor);
    }
  });

  it("AC-R2-04: full-screen exit errors keep focus mode active", async () => {
    const { divider, workspace } = fixture();
    const fullScreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.body,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: () => new Promise<void>(() => undefined),
    });
    try {
      const controller = new ViewController({ divider, workspace });
      document.body.classList.add("focus-mode");
      const leaving = controller.leaveFocusMode();
      document.dispatchEvent(new Event("fullscreenerror"));

      await expect(leaving).rejects.toThrow("Full-screen exit failed");

      expect(controller.focusMode).toBe(true);
    } finally {
      if (fullScreenDescriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
      else Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
      if (exitDescriptor === undefined) Reflect.deleteProperty(document, "exitFullscreen");
      else Object.defineProperty(document, "exitFullscreen", exitDescriptor);
    }
  });

  it("AC-R2-04: repeated focus transitions do not repeat full-screen requests", async () => {
    const { divider, workspace } = fixture();
    const enterFullScreen = vi.fn(async () => undefined);
    const leaveFullScreen = vi.fn(async () => undefined);
    const controller = new ViewController({
      divider,
      enterFullScreen,
      leaveFullScreen,
      workspace,
    });

    await controller.leaveFocusMode();
    await controller.enterFocusMode();
    await controller.enterFocusMode();
    await controller.leaveFocusMode();
    await controller.leaveFocusMode();

    expect(enterFullScreen).toHaveBeenCalledOnce();
    expect(leaveFullScreen).toHaveBeenCalledOnce();
  });

  it("AC-R2-04: an OS full-screen exit leaves focus mode", () => {
    const descriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    let fullScreenElement: Element | null = document.documentElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullScreenElement,
    });
    try {
      const { divider, workspace } = fixture();
      new ViewController({ divider, workspace });
      document.body.classList.add("focus-mode");

      fullScreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));

      expect(document.body.classList.contains("focus-mode")).toBe(false);
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
      else Object.defineProperty(document, "fullscreenElement", descriptor);
    }
  });

  it("AC-R2-04: a full-screen entry event keeps focus mode active", async () => {
    const { divider, workspace } = fixture();
    const addEventListener = vi.spyOn(document, "addEventListener");
    const fullScreenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    let completeEntry = (): void => undefined;
    const entering = new Promise<void>((resolve) => {
      completeEntry = resolve;
    });
    const controller = new ViewController({
      divider,
      enterFullScreen: () => entering,
      workspace,
    });

    try {
      const transition = controller.enterFocusMode();
      const listener = addEventListener.mock.calls.find(
        ([type]) => type === "fullscreenchange",
      )?.[1];
      if (typeof listener !== "function") throw new Error("Missing full-screen listener");
      (listener as EventListener)(new Event("fullscreenchange"));

      expect(controller.focusMode).toBe(true);
      completeEntry();
      await transition;
    } finally {
      if (fullScreenDescriptor === undefined) {
        Reflect.deleteProperty(document, "fullscreenElement");
      } else {
        Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
      }
    }
  });

  it("AC-R2-05: continuous resize uses one trailing timer", () => {
    vi.useFakeTimers();
    try {
      const { divider, workspace } = fixture();
      const addEventListener = vi.spyOn(window, "addEventListener");
      new ViewController({ divider, workspace });
      const schedule = vi.spyOn(window, "setTimeout");
      const calls = addEventListener.mock.calls as unknown as readonly (
        readonly [string, EventListenerOrEventListenerObject]
      )[];
      const listener = calls.find(([type]) => type === "resize")?.[1];
      if (typeof listener !== "function") throw new Error("Missing resize listener");
      const resize = (): void => {
        (listener as EventListener)(new Event("resize"));
      };

      resize();
      resize();
      resize();

      expect(schedule).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(250);
      resize();
      vi.advanceTimersByTime(250);
      expect(schedule).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(250);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-R2-05: the trailing resize keeps the visible preview block fixed", () => {
    vi.useFakeTimers();
    try {
      const { divider, workspace } = fixture();
      const editor = document.querySelector<HTMLElement>("#editor");
      const preview = document.querySelector<HTMLElement>("#preview");
      if (editor === null || preview === null) throw new Error("Missing pane fixture");
      const page = document.createElement("div");
      page.className = "preview-page";
      const block = document.createElement("div");
      block.className = "preview-block";
      page.append(block);
      preview.append(page);
      let blockTop = 100;
      let finishing = false;
      vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue(rect(0, 1_000));
      vi.spyOn(editor, "getBoundingClientRect").mockImplementation(() => {
        if (finishing) blockTop = 130;
        return rect(220, 390);
      });
      vi.spyOn(divider, "getBoundingClientRect").mockReturnValue(rect(607, 6));
      vi.spyOn(preview, "getBoundingClientRect").mockReturnValue(rect(610, 390));
      vi.spyOn(block, "getBoundingClientRect").mockImplementation(() => ({
        ...rect(610, 390),
        bottom: blockTop + 40,
        height: 40,
        top: blockTop,
        y: blockTop,
      }));
      new ViewController({ divider, preview, workspace });
      vi.advanceTimersByTime(50);
      Object.defineProperty(preview, "scrollTop", {
        configurable: true,
        value: 500,
        writable: true,
      });
      finishing = true;

      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);

      expect(preview.scrollTop).toBe(530);
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);
      expect(preview.scrollTop).toBe(530);
    } finally {
      vi.useRealTimers();
    }
  });
});
