import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, Menu: {} }));

import { buildContributionTemplate } from "../../src/main/app/menu";
import {
  MENU_COMMAND_IDS,
  MENU_ITEM_IDS,
  type MenuCommandId,
  type MenuContribution,
  type MenuItemId,
  isMenuItemId,
  registerMenuDeclarations,
} from "../../src/shared/ipc/menu";
import { fileMenu } from "../../src/shared/ipc/menu/file";

const registryTestMenu = {
  menuTitleKey: "menu.registryTest",
  items: [{
    id: "registry-test-item",
    titleKey: "menu.registryTest",
    accelerator: "CmdOrCtrl+T",
    commandId: "registry.test",
  }],
} as const;

declare global {
  interface SharedMenuDeclarations {
    registryTest: typeof registryTestMenu;
  }
}

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
  const template = buildContributionTemplate(
    platform,
    "MD Editor",
    contribution,
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
          "0.4|-|-|-|separator|-|-|-|-",
          "0.5|-|-|quit|-|-|-|-|-",
          "1|-|Edit|-|-|-|-|-|-",
          "1.0|-|-|cut|-|-|-|-|-",
          "1.1|-|-|copy|-|-|-|-|-",
          "1.2|-|-|paste|-|-|-|-|-",
          "1.3|-|-|-|separator|-|-|-|-",
          "1.4|-|-|selectAll|-|-|-|-|-",
          "2|-|-|windowMenu|-|-|-|-|-",
          "3|-|-|help|-|-|-|-|-",
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
          "2|-|Edit|-|-|-|-|-|-",
          "2.0|-|-|cut|-|-|-|-|-",
          "2.1|-|-|copy|-|-|-|-|-",
          "2.2|-|-|paste|-|-|-|-|-",
          "2.3|-|-|-|separator|-|-|-|-",
          "2.4|-|-|selectAll|-|-|-|-|-",
          "3|-|-|windowMenu|-|-|-|-|-",
          "4|-|-|help|-|-|-|-|-",
        ],
      }
    `);
});

it("composes every declared item id and command id from the registry", () => {
  expect(fileMenu.items.map((item) => item.id)).toEqual([...MENU_ITEM_IDS]);
  expect(fileMenu.items.map((item) => item.commandId))
    .toEqual([...MENU_COMMAND_IDS]);
});

it("adds a registered feature id to the type union and validator", () => {
  const itemId: MenuItemId = "registry-test-item";
  const commandId: MenuCommandId = "registry.test";

  registerMenuDeclarations([fileMenu, registryTestMenu]);
  try {
    expect(isMenuItemId(itemId)).toBe(true);
    expect(MENU_ITEM_IDS).toContain(itemId);
    expect(MENU_COMMAND_IDS).toContain(commandId);
  } finally {
    registerMenuDeclarations([fileMenu]);
  }
});

it("rejects an item id that is missing from its declaration", () => {
  const declarationWithoutOpen = {
    ...fileMenu,
    items: fileMenu.items.filter((item) => item.id !== "file-open"),
  };

  registerMenuDeclarations([declarationWithoutOpen]);
  try {
    expect(isMenuItemId("file-open")).toBe(false);
  } finally {
    registerMenuDeclarations([fileMenu]);
  }
});
