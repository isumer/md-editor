import "./merge.css";

import type { DocumentRecord } from "../../core/document";
import type {
  FeatureContext,
  FeatureRegistration,
} from "../../editor/featureWiring";
import { MergeView } from "./mergeView";
import { initializeMarkerMerge, markerMergeExtension } from "./markerMergeState";

function detectMerge(
  context: FeatureContext,
  view: MergeView,
  document: DocumentRecord,
  source: string,
): void {
  view.detect(document.id, source, (merge) => {
    if (!context.hasDocument(document.id)) return;
    const spec = initializeMarkerMerge(document.state, source, merge);
    if (spec === null) return;
    if (context.isActive(document)) {
      context.editor.dispatch(spec);
      view.activate(document.id, context.editor.state);
    } else {
      document.state = document.state.update(spec).state;
    }
  });
}

export const mergeFeature: FeatureRegistration = {
  editorExtensions: [markerMergeExtension],
  create(context) {
    const view = new MergeView({
      editorHost: context.editorHost,
      preview: context.preview,
      workspace: context.workspace,
      editor: context.editor,
    });
    return {
      documentActivated: (document) => view.activate(document.id, document.state),
      documentCreated: (document, source) => detectMerge(context, view, document, source),
      documentRemoved: (documentId) => view.forget(documentId),
      documentStateChanged: (documentId, state) => view.stateChanged(documentId, state),
    };
  },
};
