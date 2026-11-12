import "./merge.css";

import { createMergeState } from "../../../shared/merge/mergeChunks";
import type { MergeWorkerResult } from "../../../shared/workers/merge";
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
import mergeWorkerUrl from "./merge.worker.ts?worker&url";
import { MergeWorkerClient, type MergeWorkerPort } from "./workerClient";

interface ThreeWayInput {
  readonly base: DocumentRecord;
  readonly left: string;
  readonly right: string;
  readonly source: string;
  readonly state: DocumentRecord["state"];
}

function markerState(result: MergeWorkerResult) {
  return {
    expected: result.chunks.map((item) => result.base.slice(item.start, item.end)),
    left: result.left,
    merge: createMergeState(result.chunks),
    right: result.right,
  };
}

function installThreeWay(
  context: FeatureContext,
  view: MergeView,
  worker: MergeWorkerClient,
  input: ThreeWayInput,
): void {
  worker.request({ base: input.source, left: input.left, right: input.right }, (result) => {
    if (!context.isActive(input.base) || input.base.state !== input.state ||
      context.editor.state !== input.state) return;
    const spec = initializeThreeWayMerge(input.state, input.source, markerState(result));
    if (spec === null) return;
    view.install(input.base.id);
    context.editor.dispatch(spec);
    view.activate(input.base.id, context.editor.state);
  });
}

function openThreeWay(
  context: FeatureContext,
  view: MergeView,
  worker: MergeWorkerClient,
): void {
  const documents = context.documents();
  const base = documents.find((document) => context.isActive(document));
  const others = documents.filter((document) => document !== base);
  if (base === undefined || others.length < 1) {
    context.showStatus(formatMessage("merge.needTwo", {}));
    return;
  }
  const hasBase = documents.length >= 3;
  const left = hasBase ? others.at(-2) : base;
  const right = others.at(-1);
  if (left === undefined || right === undefined) return;
  const source = base.state.doc.toString();
  installThreeWay(context, view, worker, {
    base,
    state: base.state,
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

export function createMergeFeature(
  workerFactory?: () => MergeWorkerPort,
): FeatureRegistration {
  return {
    editorExtensions: [markerMergeExtension],
    create(context) {
      const view = new MergeView({
        editorHost: context.editorHost,
        preview: context.preview,
        workspace: context.workspace,
        editor: context.editor,
      });
      const createWorker = workerFactory ?? (() => new Worker(
        new URL(mergeWorkerUrl, window.location.href),
        { type: "module" },
      ));
      const worker = new MergeWorkerClient(
        createWorker,
        context.showStatus,
        formatMessage("merge.workerFailed", {}),
      );
      return {
        commands: {
          "file.mergeOpen": () => openThreeWay(context, view, worker),
        },
        documentActivated: (document) => view.activate(document.id, document.state),
        documentCreated: (document, source) => detectMerge(context, view, document, source),
        documentRemoved: (documentId) => view.forget(documentId),
        documentStateChanged: (documentId, state) => view.stateChanged(documentId, state),
      };
    },
  };
}

export const mergeFeature = createMergeFeature();
