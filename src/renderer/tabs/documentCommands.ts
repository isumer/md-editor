import type { EditorView } from "@codemirror/view";

import { compareMenu } from "../../shared/ipc/menu/compare";
import { composeMenuItems } from "../../shared/ipc/menu/compose";
import { fileMenu } from "../../shared/ipc/menu/file";
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

export function platformName(platform: string): "darwin" | "linux" | "win32" {
  if (platform.startsWith("Mac")) {
    return "darwin";
  }
  return platform.startsWith("Win") ? "win32" : "linux";
}

// The renderer composes its own item list; main composes the same list
// from the same declaration files (test/unit/tabsDocumentCommands.test.ts).
export const menuItems = composeMenuItems([fileMenu, compareMenu]);

export function menuContribution(): MenuContribution {
  return {
    fileMenuTitle: formatMessage(fileMenu.menuTitleKey, {}),
    items: menuItems.map((item) => ({
      id: item.id,
      title: formatMessage(item.titleKey, {}),
      accelerator: item.accelerator,
    })),
  };
}

export interface DocumentCommandsOptions {
  editor: EditorView;
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  compare(): void;
  open(): Promise<void>;
  save(saveAs: boolean): Promise<void>;
  exportHtml?(): void;
  exportPdf?(): void;
}

export class DocumentCommands {
  private readonly contextKeys = createContextKeys();
  private readonly commandContext = { contextKeys: this.contextKeys };
  private readonly commands = createCommandRegistry();
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
      id: "file.exportHtml",
      titleKey: "menu.exportHtml",
      run: this.options.exportHtml ?? (() => undefined),
    });
    this.commands.register({
      id: "file.exportPdf",
      titleKey: "menu.exportPdf",
      run: this.options.exportPdf ?? (() => undefined),
    });
    this.commands.register({
      id: "file.compareOpen",
      titleKey: "menu.compareOpen",
      run: this.options.compare,
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
  }

  private runMenu(menuItemId: MenuCommandMessage): void {
    const item = menuItems.find((candidate) => candidate.id === menuItemId);
    if (item === undefined) return;
    void this.commands.run(item.commandId, this.commandContext, undefined, "menu");
  }

  private async publish(): Promise<void> {
    this.options.onResult(await contributeMenu(menuContribution()));
  }
}
