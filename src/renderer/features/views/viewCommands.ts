import type {
  MenuContributionItem,
  MenuItemId,
  WindowAction,
} from "../../../shared/ipc/menu";
import { formatMessage } from "../../../shared/messages/en";
import type { CommandRegistry } from "../../core/commands";
import type { ViewController, ViewMode } from "./viewController";

interface ToggleState {
  readonly enabled: boolean;
  toggle(): void;
}

interface ViewCommandOptions {
  commands: CommandRegistry;
  view: ViewController;
  syncScroll: ToggleState;
  publish(action?: WindowAction): void;
}

export const VIEW_MENU_COMMANDS: Readonly<Record<MenuItemId, string>> = {
  "file-open": "file.open",
  "file-save": "file.save",
  "file-save-as": "file.saveAs",
  "view-split": "view.split",
  "view-editor": "view.editor",
  "view-preview": "view.preview",
  "view-reset-divider": "view.resetDivider",
  "view-full-screen": "view.fullScreen",
  "view-focus": "view.focus",
  "view-exit-focus": "view.exitFocus",
  "view-sync-scroll": "view.syncScroll",
};

function registerMode(
  options: ViewCommandOptions,
  id: string,
  titleKey: "menu.viewSplit" | "menu.viewEditor" | "menu.viewPreview",
  mode: ViewMode,
): void {
  options.commands.register({
    id,
    titleKey,
    run: () => {
      options.view.setMode(mode);
      options.publish();
    },
  });
}

export function registerViewCommands(options: ViewCommandOptions): void {
  registerMode(options, "view.split", "menu.viewSplit", "split");
  registerMode(options, "view.editor", "menu.viewEditor", "editor");
  registerMode(options, "view.preview", "menu.viewPreview", "preview");
  options.commands.register({
    id: "view.resetDivider",
    titleKey: "menu.resetDivider",
    run: () => options.view.setDividerPercent(50),
  });
  options.commands.register({
    id: "view.fullScreen",
    titleKey: "menu.fullScreen",
    run: () => options.publish("toggle-full-screen"),
  });
  options.commands.register({
    id: "view.focus",
    titleKey: "menu.focusMode",
    run: () => {
      options.view.enterFocusMode();
      options.publish("enter-focus");
    },
  });
  options.commands.register({
    id: "view.exitFocus",
    titleKey: "menu.exitFocusMode",
    run: () => {
      if (options.view.focusMode) {
        options.view.exitFocusMode();
        options.publish("exit-focus");
      }
    },
  });
  options.commands.register({
    id: "view.syncScroll",
    titleKey: "menu.syncScroll",
    run: () => {
      options.syncScroll.toggle();
      options.publish();
    },
  });
}

function item(
  id: MenuItemId,
  title: Parameters<typeof formatMessage>[0],
  accelerator: string,
  checked = false,
): MenuContributionItem {
  return { id, title: formatMessage(title, {}), accelerator, checked };
}

export function viewMenuItems(
  view: ViewController,
  syncScroll: ToggleState,
  platform: string,
): readonly MenuContributionItem[] {
  return [
    item("view-split", "menu.viewSplit", "CmdOrCtrl+1", view.mode === "split"),
    item("view-editor", "menu.viewEditor", "CmdOrCtrl+2", view.mode === "editor"),
    item("view-preview", "menu.viewPreview", "CmdOrCtrl+3", view.mode === "preview"),
    item("view-reset-divider", "menu.resetDivider", "CmdOrCtrl+0"),
    item(
      "view-full-screen",
      "menu.fullScreen",
      platform === "darwin" ? "Ctrl+Cmd+F" : "F11",
    ),
    item("view-focus", "menu.focusMode", "CmdOrCtrl+Shift+F", view.focusMode),
    item("view-exit-focus", "menu.exitFocusMode", "Esc", false),
    item("view-sync-scroll", "menu.syncScroll", "CmdOrCtrl+Shift+Y", syncScroll.enabled),
  ];
}
