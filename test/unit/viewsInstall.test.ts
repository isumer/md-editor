// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from "vitest";

import { viewsFeature } from "../../src/renderer/features/views/wiring";

beforeEach(() => {
  document.body.innerHTML = `
    <main id="workspace">
      <section id="editor"></section>
      <div id="divider"></div>
      <section id="preview"></section>
    </main>`;
  localStorage.clear();
  document.body.className = "";
});

function installViews() {
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const preview = document.querySelector<HTMLElement>("#preview");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (workspace === null || preview === null || editor === null) {
    throw new Error("Missing view fixture");
  }
  const hooks = viewsFeature.create({
    editor: { scrollDOM: editor },
    preview,
    workspace,
  } as unknown as Parameters<typeof viewsFeature.create>[0]);
  return { hooks, workspace };
}

it("AC-R2-01: exposes mode changes only as command handlers", () => {
  const { hooks, workspace } = installViews();

  hooks.commands?.["view.editor"]?.();
  expect(workspace.dataset["viewMode"]).toBe("editor");
  hooks.commands?.["view.preview"]?.();
  expect(workspace.dataset["viewMode"]).toBe("preview");
  hooks.commands?.["view.split"]?.();
  expect(workspace.dataset["viewMode"]).toBe("split");
});

it("does not expose commands when the view controller cannot start", () => {
  document.querySelector("#divider")?.remove();

  expect(installViews().hooks.commands).toBeUndefined();
});

it("AC-R2-04: focus mode reports transition failures", async () => {
  const showStatus = vi.fn();
  const workspace = document.querySelector<HTMLElement>("#workspace");
  const preview = document.querySelector<HTMLElement>("#preview");
  const editor = document.querySelector<HTMLElement>("#editor");
  if (workspace === null || preview === null || editor === null) {
    throw new Error("Missing view fixture");
  }
  const hooks = viewsFeature.create({
    editor: { scrollDOM: editor },
    preview,
    showStatus,
    workspace,
  } as unknown as Parameters<typeof viewsFeature.create>[0]);

  hooks.commands?.["view.focusMode"]?.();
  await vi.waitFor(() => expect(showStatus).toHaveBeenCalledOnce());

  expect(String(showStatus.mock.calls[0]?.[0]).toLowerCase()).toContain("fullscreen");
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: async () => Promise.reject("denied"),
  });
  hooks.commands?.["view.focusMode"]?.();
  await vi.waitFor(() => expect(showStatus).toHaveBeenCalledTimes(2));
  expect(showStatus).toHaveBeenLastCalledWith("denied");
});

it("AC-R2-04: Escape leaves focus mode", async () => {
  const fullScreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  const requestDescriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "requestFullscreen",
  );
  const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  let fullScreenElement: Element | null = null;
  const exitFullscreen = vi.fn(async () => {
    fullScreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullScreenElement,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: async () => {
      fullScreenElement = document.documentElement;
    },
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreen,
  });
  try {
    const { hooks } = installViews();
    hooks.commands?.["view.focusMode"]?.();
    await vi.waitFor(() => expect(document.body.classList.contains("focus-mode")).toBe(true));

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    await vi.waitFor(() => expect(document.body.classList.contains("focus-mode")).toBe(false));
    expect(exitFullscreen).toHaveBeenCalledOnce();
  } finally {
    if (fullScreenDescriptor === undefined) Reflect.deleteProperty(document, "fullscreenElement");
    else Object.defineProperty(document, "fullscreenElement", fullScreenDescriptor);
    if (requestDescriptor === undefined) {
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    } else {
      Object.defineProperty(document.documentElement, "requestFullscreen", requestDescriptor);
    }
    if (exitDescriptor === undefined) Reflect.deleteProperty(document, "exitFullscreen");
    else Object.defineProperty(document, "exitFullscreen", exitDescriptor);
  }
});
