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

describe("view controller", () => {
  beforeEach(() => localStorage.clear());

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
    window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 300 }));
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

    expect(workspace.style.getPropertyValue("--editor-share")).toBe("30%");
    expect(localStorage.getItem("view.dividerShare")).toBe("0.3");
    divider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(workspace.style.getPropertyValue("--editor-share")).toBe("50%");
    expect(localStorage.getItem("view.dividerShare")).toBe("0.5");
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
});
