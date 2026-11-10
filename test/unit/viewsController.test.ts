// @vitest-environment jsdom

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
