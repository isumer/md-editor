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

async function createViews(): Promise<HTMLElement> {
  const { viewsFeature } = await import("../../src/renderer/features/views/wiring");
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const preview = document.querySelector<HTMLElement>("#preview");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (workspace === null || preview === null || editor === null) {
    throw new Error("Missing view fixture");
  }
  viewsFeature.create({
    editor: { scrollDOM: editor },
    preview,
    workspace,
  } as unknown as Parameters<typeof viewsFeature.create>[0]);
  return workspace;
}

function pressKey(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
}

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

it("Ctrl+1/2/3 select split/editor/preview and cancel the default", async () => {
  const workspace = await createViews();
  expect(workspace.dataset["viewMode"]).toBe("split");

  const split = pressKey({ ctrlKey: true, key: "1" });
  expect(split.defaultPrevented).toBe(true);
  expect(workspace.dataset["viewMode"]).toBe("split");

  const editor = pressKey({ ctrlKey: true, key: "2" });
  expect(editor.defaultPrevented).toBe(true);
  expect(workspace.dataset["viewMode"]).toBe("editor");

  const preview = pressKey({ ctrlKey: true, key: "3" });
  expect(preview.defaultPrevented).toBe(true);
  expect(workspace.dataset["viewMode"]).toBe("preview");
});

it("Cmd is the primary key on macOS and Ctrl is ignored", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const workspace = await createViews();

  const cmd = pressKey({ metaKey: true, key: "2" });
  expect(cmd.defaultPrevented).toBe(true);
  expect(workspace.dataset["viewMode"]).toBe("editor");

  const ctrl = pressKey({ ctrlKey: true, key: "3" });
  expect(ctrl.defaultPrevented).toBe(false);
  expect(workspace.dataset["viewMode"]).toBe("editor");
});

it("Alt/Shift/other keys with Ctrl do not change the mode", async () => {
  const workspace = await createViews();

  const alt = pressKey({ ctrlKey: true, altKey: true, key: "2" });
  const shift = pressKey({ ctrlKey: true, shiftKey: true, key: "3" });
  const other = pressKey({ ctrlKey: true, key: "a" });

  expect([alt.defaultPrevented, shift.defaultPrevented, other.defaultPrevented])
    .toEqual([false, false, false]);
  expect(workspace.dataset["viewMode"]).toBe("split");
});

it("no divider means no controller or listeners", async () => {
  document.querySelector("#divider")?.remove();
  const workspace = await createViews();

  expect(menuListener).toBeNull();
  pressKey({ ctrlKey: true, key: "2" });
  expect(workspace.dataset["viewMode"]).toBeUndefined();
});
