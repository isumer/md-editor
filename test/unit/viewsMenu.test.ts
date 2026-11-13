// @vitest-environment jsdom

import type { MenuItemConstructorOptions } from "electron";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, Menu: {} }));

import { buildContributionTemplate } from "../../src/main/app/menu";
import { menuContribution } from "../../src/renderer/tabs/documentCommands";

interface TemplateItem {
  id?: string;
  label?: string;
  accelerator?: string;
  registerAccelerator?: boolean;
  click?: () => void;
  submenu?: TemplateItem[];
}

function viewItems(platform: "darwin" | "linux"): TemplateItem[] {
  const template = buildContributionTemplate(
    platform,
    "SolidMD",
    menuContribution(platform),
    vi.fn(),
  ) as unknown as TemplateItem[];
  return template.find((item) => item.label === "View")?.submenu ?? [];
}

it("AC-R2-08: builds the View menu from renderer catalog contributions", () => {
  expect(viewItems("linux").map((item) => [item.id, item.label])).toEqual([
    ["view-split", "Split View"],
    ["view-editor", "Editor Only"],
    ["view-preview", "Preview Only"],
    ["view-sync-scroll", "Sync Scroll"],
    ["view-focus-mode", "Focus Mode"],
    ["view-full-screen", "Full Screen"],
  ]);
});

it("AC-R2-01 AC-R2-03 AC-R2-04: displays chords without native registration", () => {
  const linux = viewItems("linux");
  const darwin = viewItems("darwin");

  expect(linux.map((item) => item.accelerator)).toEqual([
    "CmdOrCtrl+1",
    "CmdOrCtrl+2",
    "CmdOrCtrl+3",
    "CmdOrCtrl+Shift+L",
    "CmdOrCtrl+Shift+F",
    "F11",
  ]);
  expect(darwin[5]?.accelerator).toBe("Ctrl+Command+F");
  expect([...linux, ...darwin].every((item) => item.registerAccelerator === false))
    .toBe(true);
});

it("AC-R2-03: routes Full Screen to the renderer command channel", () => {
  const send = vi.fn();
  const template = buildContributionTemplate(
    "linux",
    "SolidMD",
    menuContribution("linux"),
    send,
  ) as unknown as TemplateItem[];
  const fullScreen = template
    .find((item) => item.label === "View")
    ?.submenu?.find((item) => item.id === "view-full-screen");

  fullScreen?.click?.();

  expect(send).toHaveBeenCalledWith("view-full-screen");
});

it("keeps the public template type compatible with Electron", () => {
  const template: MenuItemConstructorOptions[] = buildContributionTemplate(
    "linux",
    "SolidMD",
    menuContribution("linux"),
    vi.fn(),
  );
  expect(template.length).toBeGreaterThan(0);
});
