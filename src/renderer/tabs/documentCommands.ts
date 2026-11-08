import type { EditorView } from "@codemirror/view";

import type {
  MenuCommandMessage,
  MenuContribution,
  MenuItemId,
  WindowAction,
} from "../../shared/ipc/menu";
import type { Result } from "../../shared/ipc/result";
import { formatMessage } from "../../shared/messages/en";
import { createCommandRegistry } from "../core/commands";
import { createContextKeys } from "../core/contextKeys";
import { installKeymap } from "../core/keymap";
import { dispatchRedo, dispatchUndo } from "../editor/editor";
import type { SyncScrollController } from "../features/sync-scroll/syncScroll";
import {
  registerViewCommands,
  VIEW_MENU_COMMANDS,
  viewMenuItems,
} from "../features/views/viewCommands";
import type { ViewController } from "../features/views/viewController";
import { contributeMenu, onMenuCommand } from "../platform/api";

export function platformName(platform: string): "darwin" | "linux" | "win32" {
  if (platform.startsWith("Mac")) {
    return "darwin";
  }
  return platform.startsWith("Win") ? "win32" : "linux";
}

interface DocumentViewCommands {
  syncScroll: SyncScrollController;
  view: ViewController;
}

export function menuContribution(
  views?: DocumentViewCommands,
  platform?: string,
  action?: WindowAction,
): MenuContribution {
  const contribution: MenuContribution = {
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
  if (!views || platform === undefined) {
    return contribution;
  }
  const withViews: MenuContribution = {
    ...contribution,
    viewMenuTitle: formatMessage("menu.view", {}),
    viewItems: viewMenuItems(views.view, views.syncScroll, platform),
  };
  return action === undefined ? withViews : { ...withViews, windowAction: action };
}

export interface DocumentCommandsOptions {
  editor: EditorView;
  onError(error: unknown): void;
  onResult(result: Result<void>): void;
  open(): Promise<void>;
  save(saveAs: boolean): Promise<void>;
  views?: DocumentViewCommands;
}

export class DocumentCommands {
  private readonly contextKeys = createContextKeys();
  private readonly commandContext = { contextKeys: this.contextKeys };
  private readonly commands = createCommandRegistry();
  private readonly menuCommands: Readonly<Partial<Record<MenuItemId, string>>>;
  private readonly fileMenuCommands: Readonly<Partial<Record<MenuItemId, string>>> = {
    "file-open": "file.open",
    "file-save": "file.save",
    "file-save-as": "file.saveAs",
  };

  constructor(private readonly options: DocumentCommandsOptions) {
    this.register();
    if (options.views) {
      registerViewCommands({
        commands: this.commands,
        view: options.views.view,
        syncScroll: options.views.syncScroll,
        publish: (action) => {
          void this.publish(action).catch(options.onError);
        },
      });
      this.menuCommands = VIEW_MENU_COMMANDS;
    } else {
      this.menuCommands = this.fileMenuCommands;
    }
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
  }

  private runMenu(menuItemId: MenuCommandMessage): void {
    const commandId = this.menuCommands[menuItemId];
    if (commandId !== undefined) {
      void this.commands.run(commandId, this.commandContext, undefined, "menu");
    }
  }

  private async publish(action?: WindowAction): Promise<void> {
    this.options.onResult(await contributeMenu(menuContribution(
      this.options.views,
      platformName(navigator.platform),
      action,
    )));
  }
}
