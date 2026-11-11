import type { FeatureRegistration } from "../../editor/featureWiring";
import { ExportController } from "./controller";

export const exportFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    let controller: ExportController | null = null;
    const open = (format: "html" | "pdf"): void => {
      controller ??= new ExportController(context);
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
