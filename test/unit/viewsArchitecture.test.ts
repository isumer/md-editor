// @vitest-environment jsdom

import { expect, it } from "vitest";

import { menuItems as mainMenuItems } from "../../src/main/app/menu/registry";
import { messages } from "../../src/renderer/core/messages";
import {
  menuItemsWithSecondary,
} from "../../src/renderer/tabs/documentCommands";
import { createSecondaryDocumentCommands } from
  "../../src/renderer/tabs/documentCommandsSecondary";
import { viewMenu } from "../../src/shared/ipc/menu/view";

it("AC-R2-01 AC-R2-03 AC-R2-04: declares View actions for both menu composers", () => {
  const secondary = createSecondaryDocumentCommands({
    compare: () => undefined,
    merge: () => undefined,
  });
  const rendererMenuItems = menuItemsWithSecondary(secondary.menuItems);
  expect(mainMenuItems).toEqual(rendererMenuItems);
  expect(mainMenuItems.filter((item) => item.id.startsWith("view-"))).toEqual(
    viewMenu.items,
  );
});

it("AC-R2-01 AC-R2-03 AC-R2-04: resolves every View title through the message catalog", () => {
  expect(messages[viewMenu.menuTitleKey]).toBe("View");
  expect(viewMenu.items.map((item) => messages[item.titleKey])).toEqual([
    "Split View",
    "Editor Only",
    "Preview Only",
    "Focus Mode",
    "Full Screen",
  ]);
});
