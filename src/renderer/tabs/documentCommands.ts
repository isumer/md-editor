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
      {
        id: "file-compare",
        title: formatMessage("menu.compare", {}),
        accelerator: "CmdOrCtrl+Shift+C",
      },
    ],
  };
}

export interface DocumentCommandsOptions {
  editor: EditorView;
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  open(): Promise<void>;
  save(saveAs: boolean): Promise<void>;
  compare(): void;
}

export class DocumentCommands {
  private readonly contextKeys = createContextKeys();
  private readonly commandContext = { contextKeys: this.contextKeys };
  private readonly commands = createCommandRegistry();
  private readonly menuCommands: Readonly<Record<MenuItemId, string>> = {
    "file-open": "file.open",
    "file-save": "file.save",
    "file-save-as": "file.saveAs",
    "file-compare": "file.compare",
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
      id: "file.compare",
      titleKey: "menu.compare",
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
    const commandId = this.menuCommands[menuItemId];
    if (commandId !== undefined) {
      void this.commands.run(commandId, this.commandContext, undefined, "menu");
    }
  }

  private async publish(): Promise<void> {
    this.options.onResult(await contributeMenu(menuContribution()));
  }
}
