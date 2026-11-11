// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyBackgrounds, resetToThemeDefaults } from "../../src/renderer/features/background/background";
import { beginStartup } from "../../src/renderer/features/background/startup";

function createMockElements() {
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  editor.id = "editor";
  document.body.appendChild(editor);

  const preview = document.createElement("div");
  preview.id = "preview";
  document.body.appendChild(preview);

  return { editor, preview };
}

function cleanup() {
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
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
