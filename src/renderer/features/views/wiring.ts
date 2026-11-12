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
    return {
      commands: {
        "view.split": () => controller.setMode("split"),
        "view.editor": () => controller.setMode("editor"),
        "view.preview": () => controller.setMode("preview"),
      },
    };
  },
};
