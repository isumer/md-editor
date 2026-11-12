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
    updates: { enabled: true, lastCheckedAt: null },
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

  it("AC-R7-01: waits for the latest settings save before shutdown", async () => {
    let finishFirstSave: (() => void) | undefined;
    let finishLatestSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      finishFirstSave = resolve;
    });
    const latestSave = new Promise<void>((resolve) => {
      finishLatestSave = resolve;
    });
    let saveCount = 0;
    const save = vi.fn(async (_settings: SettingsReadResponse) => {
      saveCount += 1;
      await (saveCount === 1 ? firstSave : latestSave);
      return { ok: true as const, value: undefined };
    });
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: true, value: settings("light", null, null) }),
      save,
      reportError: vi.fn(),
    });

    await controller.start();
    required<HTMLButtonElement>("#background-settings-open").click();
    changeValue(required<HTMLInputElement>("#editor-background-input"), "#123456");
    changeValue(required<HTMLInputElement>("#preview-background-input"), "#abcdef");
    const flushed = controller.flush();

    await expect(Promise.race([flushed.then(() => "saved"), Promise.resolve("pending")]))
      .resolves.toBe("pending");
    if (finishFirstSave === undefined) throw new Error("first settings save did not start");
    finishFirstSave();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await expect(Promise.race([flushed.then(() => "saved"), Promise.resolve("pending")]))
      .resolves.toBe("pending");
    if (finishLatestSave === undefined) throw new Error("latest settings save did not start");
    finishLatestSave();
    await flushed;
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      editor: expect.objectContaining({ background: "#123456" }),
      preview: expect.objectContaining({ background: "#abcdef" }),
    }));
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

  it("does not expose settings controls before stored settings load", async () => {
    let resolveLoad: ((settings: SettingsReadResponse) => void) | undefined;
    const pendingLoad = new Promise<SettingsReadResponse>((resolve) => {
      resolveLoad = resolve;
    });
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: true, value: await pendingLoad }),
      save: vi.fn(async () => ({ ok: true as const, value: undefined })),
      reportError: vi.fn(),
    });

    const started = controller.start();
    expect(document.querySelector("#background-settings-open")).toBeNull();

    if (resolveLoad === undefined) throw new Error("settings load did not start");
    resolveLoad(settings("dark", "#123456", "#abcdef"));
    await started;
    expect(required<HTMLInputElement>("#editor-background-input").value)
      .toBe("#123456");
  });

  it("keeps settings accessible when the sidebar header is unavailable", async () => {
    document.querySelector(".workspace-sidebar-header")?.remove();
    controller = createBackgroundSettingsController({
      load: async () => ({ ok: true, value: settings("light", null, null) }),
      save: vi.fn(async () => ({ ok: true as const, value: undefined })),
      reportError: vi.fn(),
    });

    await controller.start();

    const open = required<HTMLButtonElement>("#background-settings-open");
    expect(open.parentElement).toBe(document.body);
    open.click();
    expect(required<HTMLDialogElement>("#background-settings-dialog").open).toBe(true);
  });

  it("reports load and save failures while system theme changes stay usable", async () => {
    const failure = {
      code: "UNKNOWN" as const,
      messageKey: "file.unknown" as const,
      params: { reason: "settings storage is unavailable" },
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
    expect(reportError).toHaveBeenCalledWith(
      "Could not access “settings”: settings storage is unavailable.",
    );
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
    await vi.waitFor(() => expect(reportError).toHaveBeenLastCalledWith(
      "Could not access “settings”: settings storage is unavailable.",
    ));
  });
});
