// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  createViewController,
  type ViewMode,
} from "../../src/renderer/features/views/viewController";
import { bindingForEvent, type KeyEventLike } from "../../src/renderer/core/keymap";

function keyEvent(key: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {},
    ...modifiers,
  };
}

function setup() {
  document.body.innerHTML = `
    <main id="workspace">
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>
    <footer id="status"></footer>
  `;
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const divider = document.querySelector<HTMLElement>("#divider");
  const status = document.querySelector<HTMLElement>("#status");
  if (!workspace || !divider || !status) {
    throw new Error("Missing test element");
  }
  const controller = createViewController({
    workspace,
    divider,
    status,
    storage: window.localStorage,
  });
  return { controller, divider, status, workspace };
}

afterEach(() => {
  window.localStorage.clear();
  document.body.replaceChildren();
});

describe("view controller", () => {
  it("AC-R2-03 AC-R2-04: binds platform full screen, focus mode, and Escape", () => {
    expect(bindingForEvent(keyEvent("F11"), "linux")).toBe("view.fullScreen");
    expect(bindingForEvent(keyEvent("f", { metaKey: true, ctrlKey: true }), "darwin"))
      .toBe("view.fullScreen");
    expect(bindingForEvent(keyEvent("f", { ctrlKey: true, shiftKey: true }), "linux"))
      .toBe("view.focus");
    expect(bindingForEvent(keyEvent("Escape"), "linux")).toBe("view.exitFocus");
  });

  it("AC-R2-01: switches among split, editor-only, and preview-only modes", () => {
    const { controller, workspace } = setup();

    for (const mode of ["editor", "preview", "split"] satisfies ViewMode[]) {
      controller.setMode(mode);
      expect(workspace.dataset["viewMode"]).toBe(mode);
    }
  });

  it("AC-R2-02: clamps, resets, and restores the divider percentage", () => {
    const first = setup();
    first.controller.setDividerPercent(30);
    expect(first.workspace.style.getPropertyValue("--editor-width")).toBe("30%");
    first.controller.dispose();

    document.body.replaceChildren();
    const second = setup();
    expect(second.controller.dividerPercent).toBe(30);
    second.divider.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(second.controller.dividerPercent).toBe(50);
  });

  it("AC-R2-04: focus mode hides chrome and restores the prior view mode", () => {
    const { controller, status, workspace } = setup();
    controller.setMode("preview");

    controller.enterFocusMode();
    expect(workspace.dataset["focusMode"]).toBe("true");
    expect(status.hidden).toBe(true);

    controller.exitFocusMode();
    expect(workspace.dataset["viewMode"]).toBe("preview");
    expect(workspace.dataset["focusMode"]).toBeUndefined();
    expect(status.hidden).toBe(false);
  });
});
