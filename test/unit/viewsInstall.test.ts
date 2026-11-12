// @vitest-environment jsdom

import { beforeAll, beforeEach, expect, it, vi } from "vitest";

import type { MenuCommandMessage } from "../../src/shared/ipc/menu";

let menuListener: ((command: MenuCommandMessage) => void) | null = null;

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      onMenuCommand: (listener: (command: MenuCommandMessage) => void) => {
        menuListener = listener;
        return vi.fn();
      },
    } as unknown as Window["api"],
  });
});

beforeEach(() => {
  document.body.innerHTML = `
    <main id="workspace">
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>`;
  localStorage.clear();
  menuListener = null;
});

it("AC-R2-01: menu commands select each view mode", async () => {
  const { viewsFeature } = await import("../../src/renderer/features/views/wiring");
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const preview = document.querySelector<HTMLElement>("#preview");
  if (workspace === null || preview === null) throw new Error("Missing view fixture");
  viewsFeature.create({
    editor: { scrollDOM: document.createElement("div") },
    preview,
    workspace,
  } as unknown as Parameters<typeof viewsFeature.create>[0]);

  menuListener?.("file-open");
  menuListener?.("view-editor");
  expect(workspace.dataset["viewMode"]).toBe("editor");
  menuListener?.("view-preview");
  expect(workspace.dataset["viewMode"]).toBe("preview");
  menuListener?.("view-split");
  expect(workspace.dataset["viewMode"]).toBe("split");

  const platform = vi.spyOn(navigator, "platform", "get");
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
  expect(platform).not.toHaveBeenCalled();
});
