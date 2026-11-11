import type { FeatureRegistration } from "../../editor/featureWiring";
import compareWorkerUrl from "./compare.worker.ts?worker&url";
import { CompareController } from "./controller";

export const compareFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    let controller: CompareController | null = null;
    const open = (): void => {
      controller ??= new CompareController({
        documents: context.documents,
        editor: context.editorHost,
        preview: context.preview,
        showStatus: context.showStatus,
        workspace: context.workspace,
        workerUrl: new URL(compareWorkerUrl, window.location.href),
      });
      controller.open();
    };
    return {
      commands: {
        "file.compareOpen": open,
      },
    };
  },
};
