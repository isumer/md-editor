import type { FeatureRegistration } from "../../editor/featureWiring";
import compareWorkerUrl from "./compare.worker.ts?worker&url";
import { CompareController } from "./controller";

export const compareFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    let controller: CompareController | null = null;
    const open = (): void => {
      controller ??= new CompareController({
        applyRight: (text) => context.editor.dispatch({
          changes: { from: 0, to: context.editor.state.doc.length, insert: text },
          userEvent: "input.compare",
        }),
        documents: context.documents,
        editor: context.editorHost,
        isActive: context.isActive,
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
