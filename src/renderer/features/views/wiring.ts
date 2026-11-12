import type { FeatureRegistration } from "../../editor/featureWiring";
import { ViewController } from "./viewController";

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
    const focusMode = (): void => {
      void controller.toggleFocusMode().catch((error: unknown) => {
        context.showStatus(error instanceof Error ? error.message : String(error));
      });
    };
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !controller.focusMode) return;
      event.preventDefault();
      focusMode();
    }, true);
    return {
      commands: {
        "view.split": () => controller.setMode("split"),
        "view.editor": () => controller.setMode("editor"),
        "view.preview": () => controller.setMode("preview"),
        "view.focusMode": focusMode,
      },
    };
  },
};
