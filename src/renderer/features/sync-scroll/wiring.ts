import type { FeatureRegistration } from "../../editor/featureWiring";
import { SyncScrollController } from "./controller";

export const syncScrollFeature: FeatureRegistration = {
  editorExtensions: [],
  create(context) {
    const controller = new SyncScrollController({
      blockLine: context.previewBlockLine ?? ((element) => Number(element.dataset["line"] ?? "0")),
      editorScroll: context.editor.scrollDOM,
      isActive: () => context.workspace.dataset["viewMode"] === "split",
      preview: context.preview,
      sourceLineAtEditorTop: () => context.editor.state.doc.lineAt(
        context.editor.lineBlockAtHeight(Math.max(0, -context.editor.documentTop)).from,
      ).number,
      scrollEditorToLine: (line) => {
        const safeLine = Math.min(context.editor.state.doc.lines, Math.max(1, line));
        const block = context.editor.lineBlockAt(context.editor.state.doc.line(safeLine).from);
        context.editor.scrollDOM.scrollTop = block.top + context.editor.documentPadding.top;
      },
    });
    return {
      commands: {
        "view.syncScroll": () => controller.toggle(),
      },
    };
  },
};
