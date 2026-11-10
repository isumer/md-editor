// @vitest-environment jsdom
/* eslint-disable max-lines -- View controller scenarios share one DOM fixture. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewController } from "../../src/renderer/features/views/viewController";

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function elements() {
  document.body.innerHTML = `
    <div id="tabs"></div>
    <main id="workspace">
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>
    <footer id="status"></footer>`;
  return {
    divider: requiredElement("#divider"),
    workspace: requiredElement("#workspace"),
  };
}

describe("view controller", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
  });

  it("AC-R2-01: switches between all pane modes without replacing either pane", () => {
    const { divider, workspace } = elements();
    const editor = document.querySelector("#editor");
    const preview = document.querySelector("#preview");
    const controller = new ViewController({ divider, workspace });

    controller.setMode("editor");
    expect(workspace.dataset["viewMode"]).toBe("editor");
    controller.setMode("preview");
    expect(workspace.dataset["viewMode"]).toBe("preview");
    expect(controller.viewMode).toBe("preview");
    controller.setMode("split");

    expect(workspace.dataset["viewMode"]).toBe("split");
    expect(document.querySelector("#editor")).toBe(editor);
    expect(document.querySelector("#preview")).toBe(preview);
  });

  it("AC-R2-02: saves a dragged divider and resets it on double-click", () => {
    const { divider, workspace } = elements();
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1_000, right: 1_000, top: 0, bottom: 600, height: 600,
      x: 0, y: 0, toJSON: () => ({}),
    });
    const controller = new ViewController({ divider, workspace });

    divider.dispatchEvent(new MouseEvent("pointerdown", { clientX: 500, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
    expect(localStorage.getItem("view.dividerShare")).toBe("0.3");
    divider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("50%");
    expect(controller.dividerShare).toBe(0.5);
  });

  it("AC-R2-02: measures the editor share from the editor's left edge, past a sidebar", () => {
    const { divider, workspace } = elements();
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 1_000, right: 1_000, top: 0, bottom: 600, height: 600,
      x: 0, y: 0, toJSON: () => ({}),
    });
    vi.spyOn(requiredElement("#editor"), "getBoundingClientRect").mockReturnValue({
      left: 200, width: 0, right: 200, top: 0, bottom: 600, height: 600,
      x: 200, y: 0, toJSON: () => ({}),
    });
    new ViewController({ divider, workspace });

    divider.dispatchEvent(new MouseEvent("pointerdown", { clientX: 500, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
  });

  it("AC-R2-02: refreshes stable pane widths after a native resize burst settles", () => {
    vi.useFakeTimers();
    try {
      const { divider, workspace } = elements();
      const editor = requiredElement("#editor");
      let workspaceRight = 1_000;
      let dividerLeft = 500;
      let dividerRight = 506;
      vi.spyOn(workspace, "getBoundingClientRect").mockImplementation(() => ({
        left: 0, width: workspaceRight, right: workspaceRight, top: 0, bottom: 600, height: 600,
        x: 0, y: 0, toJSON: () => ({}),
      }));
      vi.spyOn(divider, "getBoundingClientRect").mockImplementation(() => ({
        left: dividerLeft, width: 6, right: dividerRight, top: 0, bottom: 600, height: 600,
        x: dividerLeft, y: 0, toJSON: () => ({}),
      }));
      vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
        left: 200, width: 300, right: 500, top: 0, bottom: 600, height: 600,
        x: 200, y: 0, toJSON: () => ({}),
      });
      new ViewController({ divider, workspace });

      workspaceRight = 1_200;
      dividerLeft = 600;
      dividerRight = 606;
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(499);
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(499);
      expect(workspace.style.getPropertyValue("--editor-resize-width")).toBe("300px");
      vi.advanceTimersByTime(1);

      expect(workspace.style.getPropertyValue("--editor-resize-width")).toBe("400px");
      expect(workspace.style.getPropertyValue("--preview-resize-width")).toBe("594px");
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-R2-05: the trailing resize action keeps the visible preview block fixed", () => {
    vi.useFakeTimers();
    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    try {
      const { divider, workspace } = elements();
      const preview = requiredElement("#preview");
      const page = document.createElement("div");
      page.className = "preview-page";
      const block = document.createElement("div");
      block.className = "preview-block";
      page.append(block);
      preview.append(page);
      let blockTop = 100;
      let finishing = false;
      vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
        left: 500, width: 500, right: 1_000, top: 0, bottom: 600, height: 600,
        x: 500, y: 0, toJSON: () => ({}),
      });
      vi.spyOn(block, "getBoundingClientRect").mockImplementation(() => ({
        left: 500, width: 500, right: 1_000, top: blockTop, bottom: blockTop + 40, height: 40,
        x: 500, y: blockTop, toJSON: () => ({}),
      }));
      vi.spyOn(workspace, "getBoundingClientRect").mockImplementation(() => {
        if (finishing) blockTop = 130;
        return { left: 0, width: 1_000, right: 1_000, top: 0, bottom: 600, height: 600,
          x: 0, y: 0, toJSON: () => ({}) };
      });
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => page,
      });
      new ViewController({ divider, workspace });
      preview.scrollTop = 500;
      finishing = true;

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);

      expect(preview.scrollTop).toBe(530);
    } finally {
      if (elementFromPointDescriptor === undefined) {
        Reflect.deleteProperty(document, "elementFromPoint");
      } else {
        Object.defineProperty(document, "elementFromPoint", elementFromPointDescriptor);
      }
      vi.useRealTimers();
    }
  });

  it("AC-R2-02: a resize outside split mode keeps the captured pane widths", () => {
    vi.useFakeTimers();
    try {
      const { divider, workspace } = elements();
      const controller = new ViewController({ divider, workspace });
      controller.setMode("editor");
      const editorWidth = workspace.style.getPropertyValue("--editor-resize-width");
      const previewWidth = workspace.style.getPropertyValue("--preview-resize-width");

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);

      expect(workspace.style.getPropertyValue("--editor-resize-width")).toBe(editorWidth);
      expect(workspace.style.getPropertyValue("--preview-resize-width")).toBe(previewWidth);
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-R2-02: restores the divider position from storage", () => {
    localStorage.setItem("view.dividerShare", "0.3");
    const { divider, workspace } = elements();

    const controller = new ViewController({ divider, workspace });

    expect(controller.dividerShare).toBe(0.3);
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
  });

  it("AC-R2-04: focus mode hides chrome and restores the current view mode", async () => {
    const { divider, workspace } = elements();
    const enterFullScreen = vi.fn(async () => undefined);
    const leaveFullScreen = vi.fn(async () => undefined);
    const controller = new ViewController({
      divider,
      workspace,
      enterFullScreen,
      leaveFullScreen,
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

  it("AC-R2-04: the default full-screen exit resolves when nothing is full screen", async () => {
    const { divider, workspace } = elements();
    const controller = new ViewController({ divider, workspace });
    document.body.classList.add("focus-mode");

    await controller.leaveFocusMode();

    expect(document.body.classList.contains("focus-mode")).toBe(false);
  });

  it("AC-R2-04: the full-screen completion signal restores chrome before the exit promise", async () => {
    const { divider, workspace } = elements();
    const fullScreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    let fullScreenElement: Element | null = document.documentElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullScreenElement,
    });
    const exitFullscreen = vi.fn(() => {
      fullScreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return new Promise<void>(() => undefined);
    });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    try {
      const controller = new ViewController({ divider, workspace });
      document.body.classList.add("focus-mode");

      void controller.leaveFocusMode();
      await Promise.resolve();

      expect(document.body.classList.contains("focus-mode")).toBe(false);
      expect(exitFullscreen).toHaveBeenCalledOnce();
    } finally {
      if (fullScreenDescriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
      else Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
      if (exitDescriptor === undefined) Reflect.deleteProperty(document, "exitFullscreen");
      else Object.defineProperty(document, "exitFullscreen", exitDescriptor);
    }
  });

  it("AC-R2-04: a full-screen error keeps focus mode active", async () => {
    const { divider, workspace } = elements();
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

  it("AC-R2-04: exit avoids a request when full screen ends during listener setup", async () => {
    const { divider, workspace } = elements();
    const fullScreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    let reads = 0;
    const exitFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => reads++ === 0 ? document.body : null,
    });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    try {
      const controller = new ViewController({ divider, workspace });
      document.body.classList.add("focus-mode");

      await controller.leaveFocusMode();

      expect(controller.focusMode).toBe(false);
      expect(exitFullscreen).not.toHaveBeenCalled();
    } finally {
      if (fullScreenDescriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
      else Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
      if (exitDescriptor === undefined) Reflect.deleteProperty(document, "exitFullscreen");
      else Object.defineProperty(document, "exitFullscreen", exitDescriptor);
    }
  });

  it("AC-R2-05: trailing resize needs no correction without a visible preview block", () => {
    vi.useFakeTimers();
    try {
      const { divider, workspace } = elements();
      const preview = requiredElement("#preview");
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => preview,
      });
      new ViewController({ divider, workspace });
      preview.scrollTop = 500;

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(500);

      expect(preview.scrollTop).toBe(500);
    } finally {
      Reflect.deleteProperty(document, "elementFromPoint");
      vi.useRealTimers();
    }
  });

  it("AC-R2-04: repeated focus transitions are no-ops", async () => {
    const { divider, workspace } = elements();
    const enterFullScreen = vi.fn(async () => undefined);
    const leaveFullScreen = vi.fn(async () => undefined);
    const controller = new ViewController({
      divider,
      workspace,
      enterFullScreen,
      leaveFullScreen,
    });

    await controller.enterFocusMode();
    await controller.enterFocusMode();
    await controller.toggleFocusMode();
    await controller.leaveFocusMode();

    expect(enterFullScreen).toHaveBeenCalledOnce();
    expect(leaveFullScreen).toHaveBeenCalledOnce();
  });

  it("AC-R2-04: Escape during entry leaves full screen after entry completes", async () => {
    const { divider, workspace } = elements();
    let completeEntry: () => void = vi.fn();
    const enterFullScreen = vi.fn(() => new Promise<void>((resolve) => { completeEntry = resolve; }));
    const leaveFullScreen = vi.fn(async () => undefined);
    const controller = new ViewController({
      divider,
      workspace,
      enterFullScreen,
      leaveFullScreen,
    });

    const entering = controller.enterFocusMode();
    await controller.leaveFocusMode();
    completeEntry();
    await entering;

    expect(controller.focusMode).toBe(false);
    expect(leaveFullScreen).toHaveBeenCalledTimes(2);
  });

  it("AC-R2-04: failed full-screen exit keeps focus mode active", async () => {
    const { divider, workspace } = elements();
    const controller = new ViewController({
      divider,
      workspace,
      enterFullScreen: async () => undefined,
      leaveFullScreen: async () => Promise.reject(new Error("exit failed")),
    });

    await controller.enterFocusMode();
    await expect(controller.leaveFocusMode()).rejects.toThrow("exit failed");

    expect(controller.focusMode).toBe(true);
  });

  it("AC-R2-02: ignores divider input outside split mode or without width", () => {
    const { divider, workspace } = elements();
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      left: 0, width: 0, right: 0, top: 0, bottom: 600, height: 600,
      x: 0, y: 0, toJSON: () => ({}),
    });
    const controller = new ViewController({ divider, workspace });

    divider.dispatchEvent(new MouseEvent("pointerdown", { clientX: 300, bubbles: true }));
    expect(controller.dividerShare).toBe(0.5);
    controller.setMode("editor");
    divider.dispatchEvent(new MouseEvent("pointerdown", { clientX: 300, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(controller.dividerShare).toBe(0.5);
  });
});
