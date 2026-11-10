export const MENU_CHANNELS = {
  command: "menu:command",
  contribute: "menu:contribute",
} as const;

// Menu item ids are stable across slices: e2e tests address the items by these ids.
export const MENU_ITEM_IDS = [
  "file-open",
  "file-save",
  "file-save-as",
  "file-compare-open",
] as const;
export type MenuItemId = (typeof MENU_ITEM_IDS)[number];
export const VIEW_MENU_ITEM_IDS = [
  "view-split",
  "view-editor",
  "view-preview",
  "view-sync-scroll",
  "view-focus-mode",
] as const;
export type ViewMenuItemId = (typeof VIEW_MENU_ITEM_IDS)[number];

export interface MenuContributionItem {
  id: MenuItemId;
  title: string;
  accelerator: string;
  enabled?: boolean;
  checked?: boolean;
}

export interface MenuContribution {
  fileMenuTitle: string;
  items: readonly MenuContributionItem[];
}

export type MenuContributionResponse = void;

// What main sends back when a contributed item is clicked: the menu item id.
export type MenuCommandMessage = MenuItemId | ViewMenuItemId;

function exactData(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length < required.length ||
      ownKeys.length > required.length + optional.length) {
      return null;
    }
    const data: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string" ||
        (!required.includes(key) && !optional.includes(key))) {
        return null;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      data[key] = descriptor.value;
    }
    return required.every((key) => Object.hasOwn(data, key)) ? data : null;
  } catch {
    return null;
  }
}

function validText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validAccelerator(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+,-]{1,64}$/.test(value);
}

export function isMenuItemId(value: unknown): value is MenuItemId {
  return typeof value === "string" &&
    (MENU_ITEM_IDS as readonly string[]).includes(value);
}

export function isMenuContributionItem(
  value: unknown,
): value is MenuContributionItem {
  const item = exactData(value, ["id", "title", "accelerator"], ["enabled", "checked"]);
  return item !== null &&
    isMenuItemId(item["id"]) &&
    validText(item["title"]) &&
    validAccelerator(item["accelerator"]) &&
    (Object.hasOwn(item, "enabled") ? typeof item["enabled"] === "boolean" : true) &&
    (Object.hasOwn(item, "checked") ? typeof item["checked"] === "boolean" : true);
}

export function isMenuContribution(value: unknown): value is MenuContribution {
  const contribution = exactData(value, ["fileMenuTitle", "items"]);
  if (contribution === null ||
    !validText(contribution["fileMenuTitle"]) ||
    !Array.isArray(contribution["items"])) {
    return false;
  }
  const items: unknown[] = contribution["items"];
  if (items.length > MENU_ITEM_IDS.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!isMenuContributionItem(item) || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
  }
  return true;
}

export const menuContracts = {
  contribute: {
    channel: MENU_CHANNELS.contribute,
    validate: isMenuContribution,
  },
} as const;
