// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyBackgrounds,
  resetToThemeDefaults,
  resolveSystemTheme,
  watchSystemTheme,
} from "../../src/renderer/features/background/background";
import { beginStartup } from "../../src/renderer/features/background/startup";

function createMockElements() {
  const editorHost = document.createElement("div");
  editorHost.id = "editor";
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  editorHost.appendChild(editor);
  document.body.appendChild(editorHost);

  const preview = document.createElement("div");
  preview.id = "preview";
  document.body.appendChild(preview);

  return { editor, preview };
}

function cleanup() {
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
}

function mockSystemTheme(dark: boolean): {
  dispatch(dark: boolean): void;
  remove: ReturnType<typeof vi.fn>;
} {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const remove = vi.fn();
  const query = {
    matches: dark,
    addEventListener: vi.fn((_type: "change", next) => {
      listener = next as (event: MediaQueryListEvent) => void;
    }),
    removeEventListener: remove,
  };
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    dispatch: (matches) => listener?.({ matches } as MediaQueryListEvent),
    remove,
  };
}

describe("background feature", () => {
  beforeEach(() => {
    cleanup();
    createMockElements();
    vi.useFakeTimers();
  });

  it("applies custom editor and preview backgrounds", () => {
    applyBackgrounds({ editor: "#123456", preview: "#abcdef" }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#123456");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#abcdef");
    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#000000");
    expect(document.querySelector<HTMLElement>("#editor .cm-editor")?.style
      .getPropertyValue("--custom-background")).toBe("#123456");
    expect(document.querySelector<HTMLElement>("#preview")?.style
      .getPropertyValue("--custom-text-color")).toBe("#000000");
  });

  it("falls back to theme defaults when background is null", () => {
    applyBackgrounds({ editor: null, preview: null }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#1f2328");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#1f2328");
  });

  it("falls back to theme defaults when background is invalid", () => {
    applyBackgrounds({ editor: "invalid", preview: "also-invalid" }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#ffffff");
  });

  it("AC-R7-03: falls back to dark theme defaults when colours are invalid", () => {
    applyBackgrounds({ editor: "not-a-colour", preview: "#12345" }, "dark");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#0d1117");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#0d1117");
  });

  it("uses dark theme defaults for dark theme", () => {
    applyBackgrounds({ editor: null, preview: null }, "dark");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#0d1117");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#0d1117");
    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#e6edf3");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#e6edf3");
  });

  it("picks readable text color for editor background", () => {
    applyBackgrounds({ editor: "#000080", preview: null }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#1f2328");
  });

  it("picks readable text color for preview background", () => {
    applyBackgrounds({ editor: null, preview: "#000080" }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#1f2328");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#ffffff");
  });

  it("resets to theme defaults", () => {
    applyBackgrounds({ editor: "#123456", preview: "#abcdef" }, "light");
    resetToThemeDefaults("light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#ffffff");
    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#1f2328");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#1f2328");
  });

  it("resets to dark theme defaults", () => {
    applyBackgrounds({ editor: "#123456", preview: "#abcdef" }, "light");
    resetToThemeDefaults("dark");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#0d1117");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#0d1117");
    expect(document.documentElement.style.getPropertyValue("--editor-text-color")).toBe("#e6edf3");
    expect(document.documentElement.style.getPropertyValue("--preview-text-color")).toBe("#e6edf3");
  });

  it("handles 3-digit hex colors", () => {
    applyBackgrounds({ editor: "#abc", preview: "#def" }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#aabbcc");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#ddeeff");
  });

  it("handles uppercase hex colors", () => {
    applyBackgrounds({ editor: "#ABCDEF", preview: "#123456" }, "light");

    expect(document.documentElement.style.getPropertyValue("--editor-background")).toBe("#abcdef");
    expect(document.documentElement.style.getPropertyValue("--preview-background")).toBe("#123456");
  });
});

describe("system theme", () => {
  it("resolves the light system theme", () => {
    mockSystemTheme(false);

    expect(resolveSystemTheme()).toBe("light");
  });

  it("resolves the dark system theme", () => {
    mockSystemTheme(true);

    expect(resolveSystemTheme()).toBe("dark");
  });

  it("reports system theme changes", () => {
    const media = mockSystemTheme(false);
    const changed = vi.fn();

    const stop = watchSystemTheme(changed);
    media.dispatch(true);
    stop();

    expect(changed).toHaveBeenCalledWith("dark");
    expect(media.remove).toHaveBeenCalledOnce();
  });
});

describe("settings startup", () => {
  it("opens the document path before a rejected settings read", async () => {
    const calls: string[] = [];
    const showError = vi.fn();

    const ready = beginStartup({
      openInitialDocument: () => calls.push("document"),
      requestOpenRequests: () => {
        calls.push("open-requests");
        return Promise.resolve("ready");
      },
      loadSettings: () => {
        calls.push("settings");
        return Promise.reject(new Error("settings read failed"));
      },
      showError,
    });

    await expect(ready).resolves.toBe("ready");
    await Promise.resolve();
    expect(calls).toEqual(["document", "open-requests", "settings"]);
    expect(showError).toHaveBeenCalledWith(new Error("settings read failed"));
  });
});
