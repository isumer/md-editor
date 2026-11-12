// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Result } from "../../src/shared/ipc/result";
import type {
  SettingsReadResponse,
  SettingsWriteRequest,
  SettingsWriteResponse,
} from "../../src/shared/ipc/settings";
import { DEFAULT_SETTINGS } from "../../src/shared/settings/settings";
import {
  applyBackgrounds,
  watchSystemTheme,
} from "../../src/renderer/features/background/background";
import {
  applyFontSize,
  changeFontSize,
  clampFontSize,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from "../../src/renderer/features/theme/fontSize";
import { applyTheme, resolveTheme } from "../../src/renderer/features/theme/theme";
import {
  SettingsController,
  type Appearance,
  type SettingsBoundary,
} from "../../src/renderer/features/theme/settingsController";

function createPanes(): void {
  const editorHost = document.createElement("div");
  editorHost.id = "editor";
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  editorHost.appendChild(editor);
  document.body.appendChild(editorHost);

  const preview = document.createElement("div");
  preview.id = "preview";
  document.body.appendChild(preview);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function boundary(
  load: () => Promise<Result<SettingsReadResponse>>,
  save: (settings: SettingsWriteRequest) => Promise<Result<SettingsWriteResponse>> =
    () => Promise.resolve(ok(undefined)),
): SettingsBoundary {
  return { load, save };
}

function appearance(
  systemTheme: () => "light" | "dark" = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
): Appearance {
  return {
    systemTheme,
    apply: (theme, settings) => {
      applyTheme(theme);
      applyBackgrounds(
        {
          editor: settings.editor.background,
          preview: settings.preview.background,
        },
        theme,
      );
      applyFontSize(settings.fontSize);
    },
    watchSystem: watchSystemTheme,
  };
}

function mockSystemTheme(initialDark: boolean): {
  dispatch(dark: boolean): void;
} {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const query = {
    matches: initialDark,
    addEventListener: (_type: "change", next: (event: MediaQueryListEvent) => void) => {
      listener = next;
    },
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    dispatch: (matches) => {
      query.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
  delete document.documentElement.dataset["theme"];
  createPanes();
});

describe("theme resolution", () => {
  it("AC-R08-03: keeps an explicit theme and resolves the system theme", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  it("AC-R08-03: marks the document with the resolved theme", () => {
    applyTheme("dark");

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });
});

describe("font size", () => {
  it("AC-R08-05: clamps a size to the supported range", () => {
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(100)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(15.6)).toBe(16);
  });

  it("AC-R08-05: increases and decreases by one step", () => {
    expect(changeFontSize(14, 1)).toBe(15);
    expect(changeFontSize(14, -1)).toBe(13);
    expect(changeFontSize(MAX_FONT_SIZE, 1)).toBe(MAX_FONT_SIZE);
    expect(changeFontSize(MIN_FONT_SIZE, -1)).toBe(MIN_FONT_SIZE);
  });

  it("AC-R08-05: publishes the editor font size as a CSS variable", () => {
    applyFontSize(18);

    expect(document.documentElement.style.getPropertyValue("--editor-font-size"))
      .toBe("18px");
  });
});

describe("settings controller", () => {
  it("AC-R08-03: applies a stored theme, background and font size", async () => {
    const loaded = {
      ...DEFAULT_SETTINGS,
      theme: "dark" as const,
      fontSize: 18,
      preview: { scrollSync: true, background: "#123456" },
    };
    const controller = new SettingsController(
      boundary(() => Promise.resolve(ok(loaded))),
      appearance(() => "light"),
    );

    await controller.load();

    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--editor-font-size"))
      .toBe("18px");
    expect(document.documentElement.style.getPropertyValue("--preview-background"))
      .toBe("#123456");
    expect(controller.current().theme).toBe("dark");
  });

  it("AC-R08-03: follows the system theme while the preference is system", async () => {
    const system = mockSystemTheme(false);
    const controller = new SettingsController(
      boundary(() => Promise.resolve(ok({ ...DEFAULT_SETTINGS, theme: "system" }))),
      appearance(),
    );
    await controller.load();
    expect(document.documentElement.dataset["theme"]).toBe("light");

    system.dispatch(true);

    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("stops following the system theme for an explicit preference", async () => {
    const system = mockSystemTheme(false);
    let loadedTheme: "light" | "dark" | "system" = "system";
    const controller = new SettingsController(
      boundary(() => Promise.resolve(ok({ ...DEFAULT_SETTINGS, theme: loadedTheme }))),
      appearance(),
    );
    await controller.load();
    system.dispatch(true);
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    loadedTheme = "light";
    await controller.load();
    expect(document.documentElement.dataset["theme"]).toBe("light");

    system.dispatch(true);
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("AC-R08-02: keeps the defaults when the settings read fails", async () => {
    const controller = new SettingsController(
      boundary(() => Promise.resolve({
        ok: false,
        error: {
          code: "UNKNOWN",
          messageKey: "file.unknown",
          params: {},
          retryable: false,
        },
      })),
      appearance(() => "dark"),
    );

    await controller.load();

    expect(controller.current()).toEqual(DEFAULT_SETTINGS);
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("AC-R08-02: keeps the defaults when the settings read rejects", async () => {
    const controller = new SettingsController(
      boundary(() => Promise.reject(new Error("read failed"))),
      appearance(() => "light"),
    );

    await expect(controller.load()).resolves.toBeUndefined();

    expect(controller.current()).toEqual(DEFAULT_SETTINGS);
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("AC-R08-05: saves the new font size with unknown keys intact", async () => {
    const save = vi.fn(() => Promise.resolve(ok(undefined)));
    const controller = new SettingsController(
      boundary(
        () => Promise.resolve(ok({ ...DEFAULT_SETTINGS, futureFlag: true })),
        save,
      ),
      appearance(() => "light"),
    );
    await controller.load();

    const result = await controller.changeFontSize(1);

    expect(result.ok).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--editor-font-size"))
      .toBe("15px");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      fontSize: 15,
      futureFlag: true,
    }));
  });

  it("AC-R08-05: does not save when the font size cannot change", async () => {
    const save = vi.fn(() => Promise.resolve(ok(undefined)));
    const controller = new SettingsController(
      boundary(
        () => Promise.resolve(ok({ ...DEFAULT_SETTINGS, fontSize: MAX_FONT_SIZE })),
        save,
      ),
      appearance(() => "light"),
    );
    await controller.load();

    await expect(controller.changeFontSize(1)).resolves.toEqual(ok(undefined));
    expect(save).not.toHaveBeenCalled();
  });

  it("recovers on the next save after a rejected write", async () => {
    const save = vi
      .fn<(settings: SettingsWriteRequest) => Promise<Result<SettingsWriteResponse>>>()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(ok(undefined));
    const controller = new SettingsController(
      boundary(() => Promise.resolve(ok(DEFAULT_SETTINGS)), save),
      appearance(() => "light"),
    );
    await controller.load();

    await expect(controller.changeFontSize(1)).rejects.toThrow("save failed");
    await expect(controller.changeFontSize(1)).resolves.toEqual(ok(undefined));
  });
});
