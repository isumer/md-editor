import type { FeatureRegistration } from "../../editor/featureWiring";
import { ExportController } from "./controller";

export const exportFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    const controller = new ExportController(context);
    const open = (format: "html" | "pdf"): void => {
      controller.open(format);
    };
    return {
      commands: {
        "file.exportHtml": () => open("html"),
        "file.exportPdf": () => open("pdf"),
      },
    };
  },
};
