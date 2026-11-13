import { expect, expectTypeOf, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, Menu: {} }));

import { buildContributionTemplate } from "../../src/main/app/menu";
import {
  MENU_COMMAND_IDS,
  MENU_ITEM_IDS,
  type MenuCommandId,
  type MenuContribution,
  type MenuItemId,
  isMenuItemId,
} from "../../src/shared/ipc/menu";
import { compareMenu } from "../../src/shared/ipc/menu/compare";
import { composeMenuItems } from "../../src/shared/ipc/menu/compose";
import { fileMenu } from "../../src/shared/ipc/menu/file";
import { mergeMenu } from "../../src/shared/ipc/menu/merge";
import { viewMenu } from "../../src/shared/ipc/menu/view";

interface TemplateShape {
  id?: string;
  label?: string;
  role?: string;
  type?: string;
  enabled?: boolean;
  checked?: boolean;
  accelerator?: string;
  registerAccelerator?: boolean;
  submenu?: TemplateShape[];
}

const contribution: MenuContribution = {
  fileMenuTitle: "File",
  viewMenuTitle: "View",
  items: [
    { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" },
    { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S" },
    {
      id: "file-save-as",
      title: "Save As",
      accelerator: "CmdOrCtrl+Shift+S",
      enabled: false,
      checked: true,
    },
    {
      id: "file-compare-open",
      title: "Compare Open Files",
      accelerator: "CmdOrCtrl+Shift+C",
    },
    {
      id: "file-merge-open",
      title: "Merge Open Files",
      accelerator: "CmdOrCtrl+Shift+M",
    },
    { id: "view-split", title: "Split View", accelerator: "CmdOrCtrl+1" },
    { id: "view-editor", title: "Editor Only", accelerator: "CmdOrCtrl+2" },
    { id: "view-preview", title: "Preview Only", accelerator: "CmdOrCtrl+3" },
    { id: "view-focus-mode", title: "Focus Mode", accelerator: "CmdOrCtrl+Shift+F" },
    { id: "view-full-screen", title: "Full Screen", accelerator: "F11" },
  ],
};

function itemSnapshot(item: TemplateShape, path: string): string {
  return [
    path,
    item.id ?? "-",
    item.label ?? "-",
    item.role ?? "-",
    item.type ?? "-",
    item.accelerator ?? "-",
    item.registerAccelerator ?? "-",
    item.enabled ?? "-",
    item.checked ?? "-",
  ].join("|");
}

function templateSnapshot(
  template: readonly TemplateShape[],
  parent = "",
): string[] {
  return template.flatMap((item, index) => {
    const path = parent === "" ? String(index) : `${parent}.${index}`;
    return [
      itemSnapshot(item, path),
      ...templateSnapshot(item.submenu ?? [], path),
    ];
  });
}

function buildSnapshot(platform: string): string[] {
  const platformContribution: MenuContribution = {
    ...contribution,
    items: contribution.items.map((item) => item.id === "view-full-screen" &&
        platform === "darwin"
      ? { ...item, accelerator: "Ctrl+Command+F" }
      : item),
  };
  const template = buildContributionTemplate(
    platform,
    "MD Editor",
    platformContribution,
    vi.fn(),
  );
  return templateSnapshot(template as unknown as TemplateShape[]);
}

it("keeps every menu label, accelerator, role, order and command id", () => {
  expect({ linux: buildSnapshot("linux"), macOS: buildSnapshot("darwin") })
    .toMatchInlineSnapshot(`
      {
        "linux": [
          "0|-|File|-|-|-|-|-|-",
          "0.0|file-open|Open|-|-|CmdOrCtrl+O|false|true|false",
          "0.1|file-save|Save|-|-|CmdOrCtrl+S|false|true|false",
          "0.2|file-save-as|Save As|-|-|CmdOrCtrl+Shift+S|false|false|true",
          "0.3|file-compare-open|Compare Open Files|-|-|CmdOrCtrl+Shift+C|false|true|false",
          "0.4|file-merge-open|Merge Open Files|-|-|CmdOrCtrl+Shift+M|false|true|false",
          "0.5|-|-|-|separator|-|-|-|-",
          "0.6|-|-|quit|-|-|-|-|-",
          "1|-|Edit|-|-|-|-|-|-",
          "1.0|-|-|cut|-|-|-|-|-",
          "1.1|-|-|copy|-|-|-|-|-",
          "1.2|-|-|paste|-|-|-|-|-",
          "1.3|-|-|-|separator|-|-|-|-",
          "1.4|-|-|selectAll|-|-|-|-|-",
          "2|-|View|-|-|-|-|-|-",
          "2.0|view-split|Split View|-|-|CmdOrCtrl+1|false|true|false",
          "2.1|view-editor|Editor Only|-|-|CmdOrCtrl+2|false|true|false",
          "2.2|view-preview|Preview Only|-|-|CmdOrCtrl+3|false|true|false",
          "2.3|view-focus-mode|Focus Mode|-|-|CmdOrCtrl+Shift+F|false|true|false",
          "2.4|view-full-screen|Full Screen|-|-|F11|false|true|false",
          "3|-|-|windowMenu|-|-|-|-|-",
          "4|-|-|help|-|-|-|-|-",
          "4.0|help-check-updates|Check for Updates|-|-|-|-|-|-",
        ],
        "macOS": [
          "0|-|MD Editor|-|-|-|-|-|-",
          "0.0|-|-|about|-|-|-|-|-",
          "0.1|-|-|-|separator|-|-|-|-",
          "0.2|-|Settings|-|-|CmdOrCtrl+,|-|-|-",
          "0.3|-|-|-|separator|-|-|-|-",
          "0.4|-|-|services|-|-|-|-|-",
          "0.5|-|-|-|separator|-|-|-|-",
          "0.6|-|-|hide|-|-|-|-|-",
          "0.7|-|-|hideOthers|-|-|-|-|-",
          "0.8|-|-|unhide|-|-|-|-|-",
          "0.9|-|-|-|separator|-|-|-|-",
          "0.10|-|-|quit|-|-|-|-|-",
          "1|-|File|-|-|-|-|-|-",
          "1.0|file-open|Open|-|-|CmdOrCtrl+O|false|true|false",
          "1.1|file-save|Save|-|-|CmdOrCtrl+S|false|true|false",
          "1.2|file-save-as|Save As|-|-|CmdOrCtrl+Shift+S|false|false|true",
          "1.3|file-compare-open|Compare Open Files|-|-|CmdOrCtrl+Shift+C|false|true|false",
          "1.4|file-merge-open|Merge Open Files|-|-|CmdOrCtrl+Shift+M|false|true|false",
          "2|-|Edit|-|-|-|-|-|-",
          "2.0|-|-|cut|-|-|-|-|-",
          "2.1|-|-|copy|-|-|-|-|-",
          "2.2|-|-|paste|-|-|-|-|-",
          "2.3|-|-|-|separator|-|-|-|-",
          "2.4|-|-|selectAll|-|-|-|-|-",
          "3|-|View|-|-|-|-|-|-",
          "3.0|view-split|Split View|-|-|CmdOrCtrl+1|false|true|false",
          "3.1|view-editor|Editor Only|-|-|CmdOrCtrl+2|false|true|false",
          "3.2|view-preview|Preview Only|-|-|CmdOrCtrl+3|false|true|false",
          "3.3|view-focus-mode|Focus Mode|-|-|CmdOrCtrl+Shift+F|false|true|false",
          "3.4|view-full-screen|Full Screen|-|-|Ctrl+Command+F|false|true|false",
          "4|-|-|windowMenu|-|-|-|-|-",
          "5|-|-|help|-|-|-|-|-",
          "5.0|help-check-updates|Check for Updates|-|-|-|-|-|-",
        ],
      }
    `);
});

it("fails when a declaration drifts from the literal id unions", () => {
  const declaredItems = composeMenuItems([
    fileMenu,
    compareMenu,
    mergeMenu,
    viewMenu,
  ]);

  expect(declaredItems.map((item) => item.id)).toEqual([...MENU_ITEM_IDS]);
  expect(declaredItems.map((item) => item.commandId))
    .toEqual([...MENU_COMMAND_IDS]);
});

it("sorts menu declarations by order", () => {
  const declaredItems = composeMenuItems([
    mergeMenu,
    viewMenu,
    compareMenu,
    fileMenu,
  ]);

  expect(declaredItems.map((item) => item.id)).toEqual([...MENU_ITEM_IDS]);
});

it("keeps import order when menu declaration orders are equal", () => {
  const first = { ...fileMenu, order: 0 } as const;
  const second = { ...compareMenu, order: 0 } as const;
  const third = { ...mergeMenu, order: 0 } as const;
  const fourth = { ...viewMenu, order: 0 } as const;

  expect(composeMenuItems([first, second, third, fourth]).map((item) => item.id))
    .toEqual([...MENU_ITEM_IDS]);
});

it("keeps the type union and runtime validator on the same registry", () => {
  const itemId: MenuItemId = "file-compare-open";
  const commandId: MenuCommandId = "file.compareOpen";

  expect(isMenuItemId(itemId)).toBe(true);
  expect(MENU_COMMAND_IDS).toContain(commandId);
  expectTypeOf<MenuItemId>().toEqualTypeOf<
    | "file-open"
    | "file-save"
    | "file-save-as"
    | "file-compare-open"
    | "file-merge-open"
    | "view-split"
    | "view-editor"
    | "view-preview"
    | "view-focus-mode"
    | "view-full-screen"
  >();
});

it("rejects an item id that has no registry declaration", () => {
  expectTypeOf<MenuItemId>().not.toEqualTypeOf<"registry-test-item">();
  expect(isMenuItemId("registry-test-item")).toBe(false);
});
