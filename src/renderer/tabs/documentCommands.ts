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
    ],
  };
}

export interface DocumentCommandsOptions {
  editor: EditorView | (() => EditorView);
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  open(): Promise<void>;
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
    if (typeof options.editor !== "function") {
      options.editor.contentDOM.addEventListener("focus", () => this.refresh());
      options.editor.contentDOM.addEventListener("blur", () => this.refresh());
    }
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
      run: () => this.runUndo(),
    });
    this.commands.register({
      id: "redo",
      titleKey: "menu.redo",
      run: () => this.runRedo(),
    });
  }

  private editor(): EditorView {
    return typeof this.options.editor === "function"
      ? this.options.editor()
      : this.options.editor;
  }

  private runUndo(): void {
    if (this.options.undo) this.options.undo();
    else dispatchUndo(this.editor());
  }

  private runRedo(): void {
    if (this.options.redo) this.options.redo();
    else dispatchRedo(this.editor());
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
