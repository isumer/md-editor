// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBackgroundSettingsController,
  type BackgroundSettingsController,
} from "../../src/renderer/features/background/settingsController";
import type { SettingsReadResponse } from "../../src/shared/ipc/settings";

function settings(
  theme: "light" | "dark" | "system",
  editor: string | null,
  preview: string | null,
): SettingsReadResponse {
  return {
    version: 1,
    theme,
    fontSize: 14,
    preview: { scrollSync: true, background: preview },
    editor: { wrap: true, tabSize: 2, background: editor },
    encoding: { default: "utf-8", lineEndings: "lf" },
    ignore: ["node_modules", ".git"],
  };
}

function createPanes(): void {
  document.body.innerHTML = `
    <aside id="workspace-sidebar">
      <div class="workspace-sidebar-header"></div>
    </aside>
    <section id="editor"><div class="cm-editor"></div></section>
    <section id="preview"></section>
    <footer id="status"></footer>
  `;
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function mockSystemTheme(dark: boolean): { dispatch(next: boolean): void } {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const query = {
    matches: dark,
    addEventListener: vi.fn((_type: "change", next) => {
      listener = next as (event: MediaQueryListEvent) => void;
    }),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    dispatch: (next) => {
      query.matches = next;
      listener?.({ matches: next } as MediaQueryListEvent);
    },
  };
}

describe("background settings", () => {
  let controller: BackgroundSettingsController | undefined;

  beforeEach(() => {
    controller?.dispose();
    controller = undefined;
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-theme");
    createPanes();
    mockSystemTheme(false);
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  });

  it("AC-R7-01: applies separate colours at once and saves both", async () => {
    const save = vi.fn(async () => ({ ok: true as const, value: undefined }));
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: true, value: settings("light", null, null) }),
      save,
      reportError: vi.fn(),
    });

    await controller.start();
    expect(required<HTMLButtonElement>("#background-settings-open").parentElement)
      .toBe(required<HTMLElement>(".workspace-sidebar-header"));
    required<HTMLButtonElement>("#background-settings-open").click();
    changeValue(required<HTMLInputElement>("#editor-background-input"), "#123456");
    changeValue(required<HTMLInputElement>("#preview-background-input"), "#abcdef");

    expect(document.documentElement.style.getPropertyValue("--editor-background"))
      .toBe("#123456");
    expect(document.documentElement.style.getPropertyValue("--preview-background"))
      .toBe("#abcdef");
    await vi.waitFor(() => expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        editor: expect.objectContaining({ background: "#123456" }),
        preview: expect.objectContaining({ background: "#abcdef" }),
      }),
    ));
  });

  it("AC-R7-02: keeps a custom colour across theme changes and resets it", async () => {
    const save = vi.fn(async () => ({ ok: true as const, value: undefined }));
    const media = mockSystemTheme(false);
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: true, value: settings("dark", null, "#123456") }),
      save,
      reportError: vi.fn(),
    });

    await controller.start();
    required<HTMLButtonElement>("#background-settings-open").click();
    changeValue(required<HTMLSelectElement>("#background-theme-input"), "light");
    media.dispatch(true);
    expect(document.documentElement.style.getPropertyValue("--preview-background"))
      .toBe("#123456");

    required<HTMLButtonElement>("#preview-background-reset").click();
    expect(document.documentElement.style.getPropertyValue("--preview-background"))
      .toBe("#ffffff");
    await vi.waitFor(() => expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        theme: "light",
        preview: expect.objectContaining({ background: null }),
      }),
    ));
  });

  it("reports load and save failures while system theme changes stay usable", async () => {
    const failure = {
      code: "UNKNOWN" as const,
      messageKey: "file.unknown" as const,
      params: {},
      retryable: false,
    };
    const reportError = vi.fn();
    const media = mockSystemTheme(true);
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: false, error: failure }),
      save: async () => ({ ok: false, error: failure }),
      reportError,
    });

    await controller.start();
    expect(document.documentElement.style.getPropertyValue("--editor-background"))
      .toBe("#0d1117");
    expect(reportError).toHaveBeenCalledWith(failure);
    media.dispatch(false);
    expect(document.documentElement.style.getPropertyValue("--editor-background"))
      .toBe("#ffffff");

    required<HTMLButtonElement>("#background-settings-open").click();
    const dialog = required<HTMLDialogElement>("#background-settings-dialog");
    expect(dialog.open).toBe(true);
    changeValue(required<HTMLSelectElement>("#background-theme-input"), "dark");
    changeValue(required<HTMLSelectElement>("#background-theme-input"), "system");
    changeValue(required<HTMLInputElement>("#editor-background-input"), "#abcdef");
    required<HTMLButtonElement>("#editor-background-reset").click();
    dialog.dispatchEvent(new Event("change", { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    required<HTMLButtonElement>('[data-action="close"]').click();

    expect(dialog.open).toBe(false);
    await vi.waitFor(() => expect(reportError).toHaveBeenLastCalledWith(failure));
  });
});
