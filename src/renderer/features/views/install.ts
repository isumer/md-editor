import { createCommandRegistry } from "../../core/commands";
import { createContextKeys } from "../../core/contextKeys";
import { installKeymap } from "../../core/keymap";
import { onMenuCommand } from "../../platform/api";
import { ViewController, type ViewMode } from "./viewController";

interface ViewInstallationOptions {
  readonly divider: HTMLElement;
  readonly onError: (error: unknown) => void;
  readonly onModeChange: () => void;
  readonly toggleSync: () => void;
  readonly workspace: HTMLElement;
}

function platformName(platform: string): "darwin" | "linux" | "win32" {
  if (platform.startsWith("Mac")) return "darwin";
  return platform.startsWith("Win") ? "win32" : "linux";
}

function registerCommands(
  controller: ViewController,
  options: ViewInstallationOptions,
) {
  const commands = createCommandRegistry();
  const context = { contextKeys: createContextKeys() };
  const setMode = (mode: ViewMode): void => {
    controller.setMode(mode);
    options.onModeChange();
  };
  commands.register({ id: "view.split", titleKey: "menu.viewSplit",
    run: () => setMode("split") });
  commands.register({ id: "view.editor", titleKey: "menu.viewEditor",
    run: () => setMode("editor") });
  commands.register({ id: "view.preview", titleKey: "menu.viewPreview",
    run: () => setMode("preview") });
  commands.register({ id: "view.syncScroll", titleKey: "menu.syncScroll",
    run: options.toggleSync });
  commands.register({ id: "view.focusMode", titleKey: "menu.focusMode",
    run: () => controller.toggleFocusMode() });
  return { commands, context };
}

function installViewKeymap(
  commands: ReturnType<typeof createCommandRegistry>,
  context: { contextKeys: ReturnType<typeof createContextKeys> },
): void {
  installKeymap(document, {
    registry: commands,
    context,
    platform: platformName(navigator.platform),
    bindings: {
      "Mod-1": "view.split",
      "Mod-2": "view.editor",
      "Mod-3": "view.preview",
      "Mod-Shift-l": "view.syncScroll",
      "Mod-Shift-f": "view.focusMode",
    },
  });
}

function installViewMenu(
  commands: ReturnType<typeof createCommandRegistry>,
  context: { contextKeys: ReturnType<typeof createContextKeys> },
): void {
  const menuCommands: Readonly<Record<string, string>> = {
    "view-split": "view.split",
    "view-editor": "view.editor",
    "view-preview": "view.preview",
    "view-sync-scroll": "view.syncScroll",
    "view-focus-mode": "view.focusMode",
  };
  onMenuCommand((item) => {
    const command = menuCommands[String(item)];
    if (command) void commands.run(command, context);
  });
}

export function installViews(options: ViewInstallationOptions): void {
  const controller = new ViewController(options);
  const { commands, context } = registerCommands(controller, options);
  installViewKeymap(commands, context);
  installViewMenu(commands, context);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !controller.focusMode) return;
    event.preventDefault();
    void controller.leaveFocusMode().catch(options.onError);
  }, true);
}
