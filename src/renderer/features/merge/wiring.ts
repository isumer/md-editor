import "./merge.css";

import type { DocumentRecord } from "../../core/document";
import { formatMessage } from "../../core/messages";
import type {
  FeatureContext,
  FeatureRegistration,
} from "../../editor/featureWiring";
import { MergeView } from "./mergeView";
import {
  initializeMarkerMerge,
  initializeThreeWayMerge,
  markerMergeExtension,
} from "./markerMergeState";

interface ThreeWayInput {
  readonly base: DocumentRecord;
  readonly left: string;
  readonly right: string;
  readonly source: string;
}

function installThreeWay(
  context: FeatureContext,
  view: MergeView,
  input: ThreeWayInput,
): void {
  void import("./threeWayMerge").then(({ createThreeWayMergeState }) => {
    const merge = createThreeWayMergeState(input.source, input.left, input.right);
    const spec = initializeThreeWayMerge(input.base.state, input.source, merge);
    if (spec === null || !context.isActive(input.base)) return;
    view.install(input.base.id);
    context.editor.dispatch(spec);
    view.activate(input.base.id, context.editor.state);
  }).catch((error: unknown) => {
    context.showStatus(error instanceof Error ? error.message : String(error));
  });
}

function openThreeWay(context: FeatureContext, view: MergeView): void {
  const documents = context.documents();
  const base = documents.find((document) => context.isActive(document));
  const sides = documents.filter((document) => document !== base).slice(-2);
  const left = sides[0];
  const right = sides[1];
  if (base === undefined || left === undefined || right === undefined) {
    context.showStatus(formatMessage("merge.needThree", {}));
    return;
  }
  const source = base.state.doc.toString();
  installThreeWay(context, view, {
    base,
    left: left.state.doc.toString(),
    right: right.state.doc.toString(),
    source,
  });
}

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
      commands: {
        "file.mergeOpen": () => openThreeWay(context, view),
      },
      documentActivated: (document) => view.activate(document.id, document.state),
      documentCreated: (document, source) => detectMerge(context, view, document, source),
      documentRemoved: (documentId) => view.forget(documentId),
      documentStateChanged: (documentId, state) => view.stateChanged(documentId, state),
    };
  },
};
