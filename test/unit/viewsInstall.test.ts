// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuCommandMessage } from "../../src/shared/ipc/menu";

let menuListener: ((command: MenuCommandMessage) => void) | null = null;

beforeAll(() => {
  const boundary = {
    onMenuCommand: vi.fn((listener: (command: MenuCommandMessage) => void) => {
      menuListener = listener;
      return vi.fn();
    }),
  } as unknown as Window["api"];
  Object.defineProperty(window, "api", { configurable: true, value: boundary });
});

beforeEach(() => {
  document.body.innerHTML = `<main id="workspace"><div id="divider"></div></main>`;
  document.body.className = "";
  menuListener = null;
});

describe("view installation", () => {
  it("focus-mode menu and key commands report full-screen rejection", async () => {
    const failure = new Error("Full screen failed");
    const requestFullscreen = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const exitFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.body,
    });
    const onError = vi.fn();
    const onModeChange = vi.fn();
    const toggleSync = vi.fn();
    const { installViews } = await import("../../src/renderer/features/views/install");
    const divider = document.querySelector<HTMLElement>("#divider");
    const workspace = document.querySelector<HTMLElement>("#workspace");
    if (divider === null || workspace === null) throw new Error("Missing view test elements");
    installViews({ divider, onError, onModeChange, toggleSync, workspace });

    menuListener?.("file-open");
    menuListener?.("view-editor");
    expect(workspace.dataset["viewMode"]).toBe("editor");
    menuListener?.("view-preview");
    expect(workspace.dataset["viewMode"]).toBe("preview");
    menuListener?.("view-split");
    expect(workspace.dataset["viewMode"]).toBe("split");
    menuListener?.("view-sync-scroll");
    expect(onModeChange).toHaveBeenCalledTimes(3);
    expect(toggleSync).toHaveBeenCalledOnce();
    menuListener?.("view-focus-mode");
    await Promise.resolve();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "f",
      shiftKey: true,
    }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    expect(requestFullscreen).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, failure);
    expect(onError).toHaveBeenNthCalledWith(2, failure);

    menuListener?.("view-focus-mode");
    await vi.waitFor(() => expect(document.body.classList.contains("focus-mode")).toBe(true));
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await vi.waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
    expect(document.body.classList.contains("focus-mode")).toBe(false);

    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    installViews({ divider, onError, onModeChange, toggleSync, workspace });
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Win32" });
    installViews({ divider, onError, onModeChange, toggleSync, workspace });
  });
});
