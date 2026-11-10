import type { EditorView } from "@codemirror/view";

import type { MenuCommandMessage, MenuContribution, MenuItemId } from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";
import { formatMessage } from "../../shared/messages/en";
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

export function selectFocusedDocument<T>(
  primary: T,
  secondary: T,
  secondaryHasFocus: boolean,
): T {
  return secondaryHasFocus ? secondary : primary;
}

export function menuContribution(): MenuContribution {
  return {
    fileMenuTitle: formatMessage("menu.file", {}),
    items: [
      { id: "file-open", title: formatMessage("menu.open", {}), accelerator: "CmdOrCtrl+O" },
      { id: "file-save", title: formatMessage("menu.save", {}), accelerator: "CmdOrCtrl+S" },
      {
        id: "file-save-as",
        title: formatMessage("menu.saveAs", {}),
        accelerator: "CmdOrCtrl+Shift+S",
      },
      {
        id: "file-compare-open",
        title: formatMessage("menu.compareOpen", {}),
        accelerator: "CmdOrCtrl+Shift+C",
      },
    ],
  };
}

export interface DocumentCommandsOptions {
  editor(): EditorView;
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  compare(): void;
  open(): Promise<void>;
  otherView?(target: string, action: "clone" | "move"): void;
  redo?(): void;
  save(saveAs: boolean): Promise<void>;
  undo?(): void;
}

export class DocumentCommands {
  private readonly contextKeys = createContextKeys();
  private readonly commandContext = { contextKeys: this.contextKeys };
  private readonly commands = createCommandRegistry();
  private readonly menuCommands: Readonly<Record<MenuItemId, string>> = {
    "file-open": "file.open",
    "file-save": "file.save",
    "file-save-as": "file.saveAs",
    "file-compare-open": "file.compareOpen",
  };

  constructor(private readonly options: DocumentCommandsOptions) {
    this.register();
    onMenuCommand((item) => this.runMenu(item));
    installKeymap(document, {
      registry: this.commands,
      context: this.commandContext,
      platform: platformName(navigator.platform),
    });
    this.refresh();
    void this.publish().catch(options.onError);
  }

  refresh(): void {
    const editor = this.editor();
    const keys = new Set<string>();
    if (editor.hasFocus) {
      keys.add("editorFocus");
    }
    if (editor.state.selection.ranges.some((range) => !range.empty)) {
      keys.add("hasSelection");
    }
    this.contextKeys.set(keys);
  }

  run(id: string, target: string): void {
    void this.commands.run(id, this.commandContext, undefined, target);
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
      id: "file.compareOpen",
      titleKey: "menu.compareOpen",
      run: this.options.compare,
    });
    this.commands.register({
      id: "undo",
      titleKey: "menu.undo",
      run: () => this.runUndo(),
    });
    this.commands.register({
      id: "redo",
      titleKey: "menu.redo",
      run: () => this.runRedo(),
    });
    this.commands.register({
      id: "tab.moveToOtherView",
      titleKey: "tab.moveToOtherView",
      run: (_context, _args, target) => this.runOtherView(target, "move"),
    });
    this.commands.register({
      id: "tab.cloneToOtherView",
      titleKey: "tab.cloneToOtherView",
      run: (_context, _args, target) => this.runOtherView(target, "clone"),
    });
  }

  private editor(): EditorView {
    return this.options.editor();
  }

  private runUndo(): void {
    if (this.options.undo) this.options.undo();
    else dispatchUndo(this.editor());
  }

  private runRedo(): void {
    if (this.options.redo) this.options.redo();
    else dispatchRedo(this.editor());
  }

  private runOtherView(
    target: string | undefined,
    action: "clone" | "move",
  ): void {
    if (target !== undefined) {
      this.options.otherView?.(target, action);
    }
  }

  private runMenu(menuItemId: MenuCommandMessage): void {
    const commandId = this.menuCommands[menuItemId];
    if (commandId !== undefined) {
      void this.commands.run(commandId, this.commandContext, undefined, "menu");
    }
  }

  private async publish(): Promise<void> {
    this.options.onResult(await contributeMenu(menuContribution()));
  }
}
