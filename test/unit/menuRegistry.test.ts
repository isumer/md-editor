import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, Menu: {} }));

import { buildContributionTemplate } from "../../src/main/app/menu";
import type { MenuContribution } from "../../src/shared/ipc/menu";

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
          "0.3|-|-|-|separator|-|-|-|-",
          "0.4|-|-|quit|-|-|-|-|-",
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
