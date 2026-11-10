import { formatMessage } from "../../core/messages";
import type { FeatureRegistration } from "../../editor/featureWiring";
import type { CompareController } from "./controller";

export const compareFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    let controller: CompareController | null = null;
    let loading: Promise<void> | null = null;
    const open = (): void => {
      if (context.documents().length < 2) {
        context.showStatus(formatMessage("compare.needTwo", {}));
        return;
      }
      if (controller) {
        controller.open();
        return;
      }
      loading ??= Promise.all([
        import("./controller"),
        import("./compare.worker.ts?worker&url"),
      ]).then(([{ CompareController }, { default: compareWorkerUrl }]) => {
        controller = new CompareController({
          documents: context.documents,
          editor: context.editorHost,
          preview: context.preview,
          showStatus: context.showStatus,
          workspace: context.workspace,
          workerUrl: new URL(compareWorkerUrl, window.location.href),
        });
        controller.open();
      }).catch(() => {
        context.showStatus(formatMessage("compare.workerFailed", {}));
      }).finally(() => {
        loading = null;
      });
      void loading;
    };
    return {
      commands: {
        "file.compareOpen": open,
      },
    };
  },
};
