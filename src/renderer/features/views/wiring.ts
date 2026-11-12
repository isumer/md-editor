import type { MenuCommandMessage } from "../../../shared/ipc/menu";
import type { FeatureRegistration } from "../../editor/featureWiring";
import { onMenuCommand } from "../../platform/api";
import { ViewController, type ViewMode } from "./viewController";

const MENU_MODES: Partial<Record<MenuCommandMessage, ViewMode>> = {
  "view-editor": "editor",
  "view-preview": "preview",
  "view-split": "split",
};

function shortcutMode(event: KeyboardEvent): ViewMode | null {
  if (!event.ctrlKey && !event.metaKey) return null;
  const primary = navigator.platform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
  if (!primary || event.altKey || event.shiftKey) return null;
  if (event.key === "1") return "split";
  if (event.key === "2") return "editor";
  return event.key === "3" ? "preview" : null;
}

export const viewsFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    const divider = document.querySelector<HTMLElement>("#divider");
    if (divider === null) return {};
    const controller = new ViewController({
      divider,
      editorScroll: context.editor.scrollDOM,
      preview: context.preview,
      workspace: context.workspace,
    });
    onMenuCommand((command) => {
      const mode = MENU_MODES[command];
      if (mode !== undefined) controller.setMode(mode);
    });
    document.addEventListener("keydown", (event) => {
      const mode = shortcutMode(event);
      if (mode === null) return;
      event.preventDefault();
      controller.setMode(mode);
    }, true);
    return {};
  },
};
