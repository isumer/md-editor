import type { EditorView } from "@codemirror/view";

import { composeMenuItems } from "../../shared/ipc/menu/compose";
import { fileMenu } from "../../shared/ipc/menu/file";
import { viewMenu } from "../../shared/ipc/menu/view";
import {
  type MenuCommandMessage,
  type MenuContribution,
} from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";
import { formatMessage } from "../core/messages";
import { createCommandRegistry } from "../core/commands";
import { createContextKeys } from "../core/contextKeys";
import { installKeymap } from "../core/keymap";
import { dispatchRedo, dispatchUndo } from "../editor/editor";
import { contributeMenu, onMenuCommand } from "../platform/api";
import type { SecondaryDocumentCommands } from "./documentCommandsSecondary";

export function platformName(platform: string): "darwin" | "linux" | "win32" {
  if (platform.startsWith("Mac")) {
    return "darwin";
  }
  return platform.startsWith("Win") ? "win32" : "linux";
}

// The renderer composes its own item list; main composes the same list
// from the same declaration files (test/unit/tabsDocumentCommands.test.ts).
const fileMenuItems = composeMenuItems([fileMenu]);
const viewMenuItems = composeMenuItems([viewMenu]);
export const menuItems = [...fileMenuItems, ...viewMenuItems];

type SecondaryMenuItem = SecondaryDocumentCommands["menuItems"][number];
type MenuItem = (typeof menuItems)[number] | SecondaryMenuItem;

type Platform = "darwin" | "linux" | "win32";

export function menuItemsWithSecondary(
  secondaryItems: readonly SecondaryMenuItem[],
): readonly MenuItem[] {
  return [...fileMenuItems, ...secondaryItems, ...viewMenuItems];
}

function accelerator(item: MenuItem, platform: Platform): string {
  return platform === "darwin" && "darwinAccelerator" in item
    ? item.darwinAccelerator
    : item.accelerator;
}

export function menuContribution(
  input: Platform | readonly MenuItem[] = platformName(navigator.platform),
  itemPlatform: Platform = platformName(navigator.platform),
): MenuContribution {
  const items = typeof input === "string" ? menuItems : input;
  const platform = typeof input === "string" ? input : itemPlatform;
  return {
    fileMenuTitle: formatMessage(fileMenu.menuTitleKey, {}),
    viewMenuTitle: formatMessage(viewMenu.menuTitleKey, {}),
    items: items.map((item) => ({
      id: item.id,
      title: formatMessage(item.titleKey, {}),
      accelerator: accelerator(item, platform),
    })),
  };
}

export interface DocumentCommandsOptions {
  editor: EditorView;
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  loadSecondary(): Promise<SecondaryDocumentCommands>;
  featureCommand(commandId: string): void;
  open(): Promise<void>;
  save(saveAs: boolean): Promise<void>;
  toggleFullScreen(): Promise<void>;
}

export class DocumentCommands {
  private readonly contextKeys = createContextKeys();
  private readonly commandContext = { contextKeys: this.contextKeys };
  private readonly commands = createCommandRegistry();
  private secondaryMenuItems: readonly SecondaryMenuItem[] = [];
  private secondaryStarted = false;
  constructor(private readonly options: DocumentCommandsOptions) {
    this.register();
    onMenuCommand((item) => this.runMenu(item));
    installKeymap(document, {
      registry: this.commands,
      context: this.commandContext,
      platform: platformName(navigator.platform),
    });
    this.refresh();
    options.editor.contentDOM.addEventListener("focus", () => this.refresh());
    options.editor.contentDOM.addEventListener("blur", () => this.refresh());
    void this.publish().catch(options.onError);
  }

  refresh(): void {
    const keys = new Set<string>();
    if (this.options.editor.hasFocus) {
      keys.add("editorFocus");
    }
    if (this.options.editor.state.selection.ranges.some((range) => !range.empty)) {
      keys.add("hasSelection");
    }
    this.contextKeys.set(keys);
  }

  private register(): void {
    this.commands.register({ id: "file.open", titleKey: "menu.open", run: this.options.open });
    this.commands.register({
      id: "file.save",
      titleKey: "menu.save",
      run: () => this.options.save(false),
    });
    this.commands.register({
      id: "file.saveAs",
      titleKey: "menu.saveAs",
      run: () => this.options.save(true),
    });
    this.commands.register({
      id: "undo",
      titleKey: "menu.undo",
      run: () => dispatchUndo(this.options.editor),
    });
    this.commands.register({
      id: "redo",
      titleKey: "menu.redo",
      run: () => dispatchRedo(this.options.editor),
    });
    for (const item of viewMenu.items) {
      this.commands.register({
        id: item.commandId,
        titleKey: item.titleKey,
        run: item.commandId === "view.toggleFullScreen"
          ? this.options.toggleFullScreen
          : () => this.options.featureCommand(item.commandId),
      });
    }
  }

  startSecondaryFeatures(): void {
    if (this.secondaryStarted) return;
    this.secondaryStarted = true;
    void this.options.loadSecondary().then((secondary) => {
      secondary.install(this.commands);
      this.secondaryMenuItems = secondary.menuItems;
      return this.publish();
    }).catch(this.options.onError);
  }

  private runMenu(menuItemId: MenuCommandMessage): void {
    const item = menuItemsWithSecondary(this.secondaryMenuItems)
      .find((candidate) => candidate.id === menuItemId);
    if (item === undefined) return;
    void this.commands.run(item.commandId, this.commandContext, undefined, "menu")
      .catch(this.options.onError);
  }

  private async publish(): Promise<void> {
    this.options.onResult(await contributeMenu(
      menuContribution(menuItemsWithSecondary(this.secondaryMenuItems)),
    ));
  }
}
