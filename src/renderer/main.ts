/* eslint-disable max-lines -- Application composition stays in one entry module. */
import { Text, Transaction, type ChangeSet, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { Result } from "../shared/ipc/result";
import { formatMessage } from "../shared/messages/en";
import { DraftScheduler } from "./core/draftScheduler";
import {
  createDocumentRecord,
  createDocumentState,
  documentTitle,
  isDocumentDirty,
  messageParams,
  type DocumentRecord,
} from "./core/document";
import { DocumentRegistry } from "./core/documentRegistry";
import { FrameCoalescer } from "./core/frameCoalescer";
import {
  DocumentReplication,
} from "./core/replication";
import {
  createEditor,
  createEditorState,
  dispatchRedo,
  dispatchUndo,
  editorCallbacksEffect,
  type EditorCallbacks,
} from "./editor/editor";
import { CompareController } from "./features/compare/controller";
import compareWorkerUrl from "./features/compare/compare.worker.ts?worker&url";
import "./features/compare/compare.css";
import { MergeView } from "./features/merge/mergeView";
import "./features/merge/merge.css";
import {
  initializeMarkerMerge,
  markerMergeExtension,
  type MarkerMergeState,
} from "./features/merge/markerMergeState";
import {
  wirePreviewLinks,
} from "./features/preview/preview";
import { rewriteAssetUrls } from "./features/preview/rewriteAssets";
import { WorkspaceSidebar } from "./features/workspace/workspaceSidebar";
import renderWorkerUrl from "./workers/render/render.worker.ts?worker&url";
import {
  attachDocument,
  clearDraft,
  detachDocument,
  onOpenRequest,
  onSessionCloseRequest,
  readyForOpenRequests,
  sendChanges,
} from "./platform/api";
import { DocumentClosePrompt } from "./tabs/closePrompt";
import { DocumentCommands, selectFocusedDocument } from "./tabs/documentCommands";
import { DocumentLifecycle } from "./tabs/documentLifecycle";
import { RenderController } from "./tabs/renderController";
import { TabStrip } from "./tabs/tabStrip";
import { DocumentViews, type DocumentViewId } from "./tabs/documentViews";
import "./styles.css";

// This composition root exceeds 400 lines because it owns document lifecycle and view wiring.

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const editorHost = requiredElement<HTMLElement>("#editor");
const workspace = requiredElement<HTMLElement>("#workspace");
const preview = requiredElement<HTMLElement>("#preview");
const previewError = requiredElement<HTMLElement>("#preview-error");
const status = requiredElement<HTMLElement>("#status");
const tabsHost = requiredElement<HTMLElement>("#tabs");
const tabsTwoHost = requiredElement<HTMLElement>("#tabs-two");
const editorTwoHost = requiredElement<HTMLElement>("#editor-two");
const viewTwoHost = requiredElement<HTMLElement>("#document-view-two");
const closePrompt = requiredElement<HTMLElement>("#close-prompt");
const closePromptMessage = requiredElement<HTMLElement>("#close-prompt-message");
const workspaceElements = {
  empty: requiredElement<HTMLElement>("#workspace-empty"),
  filter: requiredElement<HTMLInputElement>("#workspace-filter"),
  open: requiredElement<HTMLButtonElement>("#workspace-open"),
  title: requiredElement<HTMLElement>("#workspace-title"),
  tree: requiredElement<HTMLElement>("#workspace-tree"),
};
const documentState = createDocumentState();
const secondaryDocumentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let statusFromPreview = false;
let editor: EditorView;
let editorTwo: EditorView;
let secondaryDocument: DocumentRecord | null = null;
let mirroring = false;
const documentViews = new DocumentViews();
let mergeView: MergeView;
let lifecycle: DocumentLifecycle;
let documentCommands: DocumentCommands | null = null;
let compareController: CompareController | null = null;

function showStatus(message = ""): void {
  statusFromPreview = false;
  status.textContent = message;
}

function openCompare(): void {
  compareController ??= new CompareController({
    documents: () => registry.all(),
    editor: editorHost,
    preview,
    showStatus,
    workspace,
    workerUrl: new URL(compareWorkerUrl, window.location.href),
  });
  compareController.open();
}

// A successful render clears only the preview's own error, never a file failure.
function showPreviewStatus(message = ""): void {
  if (message || statusFromPreview) {
    status.textContent = message;
    statusFromPreview = message !== "";
  }
}

function showPreviewError(message = ""): void {
  previewError.textContent = message;
  previewError.hidden = message === "";
}

function updateTitle(): void {
  const state = selectFocusedDocument(
    documentState,
    secondaryDocumentState,
    editorTwo.hasFocus,
  );
  document.title = documentTitle(state);
}

function syncDocumentState(document: DocumentRecord, state = documentState): void {
  state.currentGrant = document.grant;
  state.currentName = document.name;
  state.saved = document.saved.text;
  state.dirty = document.dirty;
}

function focusedDocument(): DocumentRecord | null {
  return selectFocusedDocument(activeDocument, secondaryDocument, editorTwo.hasFocus);
}

function syncDirty(document: DocumentRecord): void {
  tabStrip.update(document);
  tabStripTwo.update(document);
  if (document !== focusedDocument()) {
    return;
  }
  syncDocumentState(
    document,
    editorTwo.hasFocus ? secondaryDocumentState : documentState,
  );
  updateTitle();
}

const renderController = new RenderController({
  current: () => activeDocument,
  preview,
  restartMessage: formatMessage("preview.workerRestarted", {}),
  rewriteHtml: (html) => rewriteAssetUrls(html, {
    windowId,
    grant: activeDocument?.grant ?? null,
  }),
  showError: showPreviewError,
  showStatus: showPreviewStatus,
  workerUrl: new URL(renderWorkerUrl, window.location.href),
});

const callbacks: EditorCallbacks = {
  onDocumentChanged: () => {
    if (mirroring) return;
    const document = activeDocument;
    if (document) {
      document.state = editor.state;
      saveEditorViewState(document, 1, editor);
      dirtyFrame.changed(document);
    }
    renderController.schedule();
  },
  onChanges: (changes, state) => {
    if (mirroring) return;
    const document = activeDocument;
    if (!document) {
      return;
    }
    document.state = state;
    saveEditorViewState(document, 1, editor);
    syncPeerEditor(document, 1, changes);
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: (state) => {
    if (mirroring) return;
    documentCommands?.refresh();
    mergeView?.stateChanged(activeDocument?.id ?? null, state);
  },
};

editor = createEditor(editorHost, documentState, callbacks);
const secondaryCallbacks: EditorCallbacks = {
  onDocumentChanged: () => {
    if (mirroring) return;
    const document = secondaryDocument;
    if (document) {
      document.state = editorTwo.state;
      saveEditorViewState(document, 2, editorTwo);
    }
  },
  onChanges: (changes, state) => {
    if (mirroring) return;
    const document = secondaryDocument;
    if (!document) return;
    document.state = state;
    saveEditorViewState(document, 2, editorTwo);
    syncPeerEditor(document, 2, changes);
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: () => {
    if (!mirroring) documentCommands?.refresh();
  },
};
editorTwo = createEditor(editorTwoHost, secondaryDocumentState, secondaryCallbacks);

function hydrateEditor(view: DocumentViewId): void {
  const target = view === 1 ? editor : editorTwo;
  const document = view === 1 ? activeDocument : secondaryDocument;
  if (!document) return;
  saveEditorViewState(document, view, target);
  const scrollTop = target.scrollDOM.scrollTop;
  target.setState(editorStateForView(document, view));
  target.scrollDOM.scrollTop = scrollTop;
}

function focusEditor(view: DocumentViewId): void {
  hydrateEditor(view);
  const document = view === 1 ? activeDocument : secondaryDocument;
  if (document) {
    syncDocumentState(document, view === 1 ? documentState : secondaryDocumentState);
    updateTitle();
  }
}

editor.contentDOM.addEventListener("focus", () => focusEditor(1));
editorTwo.contentDOM.addEventListener("focus", () => focusEditor(2));

function saveEditorViewState(
  document: DocumentRecord,
  view: DocumentViewId,
  source: EditorView,
): void {
  documentViews.saveState(document.id, view, {
    scrollTop: source.scrollDOM.scrollTop,
    selection: source.state.selection,
  });
}

function editorStateForView(
  document: DocumentRecord,
  view: DocumentViewId,
): EditorState {
  const selection = documentViews.state(document.id, view)?.selection ??
    document.state.selection;
  return document.state.update({
    annotations: Transaction.addToHistory.of(false),
    effects: editorCallbacksEffect(
      view === 1 ? documentState : secondaryDocumentState,
      view === 1 ? callbacks : secondaryCallbacks,
    ),
    selection,
  }).state;
}

function syncPeerEditor(
  document: DocumentRecord,
  sourceView: DocumentViewId,
  changes: ChangeSet,
): void {
  const peerView = sourceView === 1 ? 2 : 1;
  const peer = peerView === 1 ? editor : editorTwo;
  const peerDocument = peerView === 1 ? activeDocument : secondaryDocument;
  if (peerDocument !== document) {
    const stored = documentViews.state(document.id, peerView);
    if (stored !== undefined) {
      documentViews.saveState(document.id, peerView, {
        ...stored,
        selection: stored.selection.map(changes),
      });
    }
    return;
  }
  documentViews.saveState(document.id, peerView, {
    scrollTop: peer.scrollDOM.scrollTop,
    selection: peer.state.selection.map(changes),
  });
  const scrollTop = peer.scrollDOM.scrollTop;
  const peerDocumentState = peerView === 1 ? documentState : secondaryDocumentState;
  mirroring = true;
  peerDocumentState.applyingDocument = true;
  try {
    peer.dispatch({
      annotations: Transaction.addToHistory.of(false),
      changes,
    });
    saveEditorViewState(document, peerView, peer);
    peer.scrollDOM.scrollTop = scrollTop;
  } finally {
    peerDocumentState.applyingDocument = false;
    mirroring = false;
  }
}

function runHistory(event: "redo" | "undo"): void {
  const secondary = editorTwo.hasFocus;
  hydrateEditor(secondary ? 2 : 1);
  const activeEditor = secondary ? editorTwo : editor;
  if (event === "undo") dispatchUndo(activeEditor);
  else dispatchRedo(activeEditor);
}
mergeView = new MergeView({
  editorHost,
  preview,
  workspace,
  editor,
});

const drafts = new DraftScheduler({
  onDraft: (docId) => lifecycle.sendDraft(docId),
});

// Dirty state is evaluated at most once per frame, and only that tab row updates.
const dirtyFrame = new FrameCoalescer<DocumentRecord>({
  requestFrame: (callback) => {
    requestAnimationFrame(callback);
  },
  apply: (document) => {
    if (!registry.get(document.id)) {
      return;
    }
    document.dirty = isDocumentDirty(document);
    if (document.dirty) {
      drafts.documentChanged(document.id, document.state.doc.length);
    } else {
      drafts.documentSaved(document.id);
    }
    syncDirty(document);
  },
});

const prompt = new DocumentClosePrompt(closePrompt, closePromptMessage);
const tabStrip = new TabStrip({
  active: () => activeDocument,
  close: (document) => {
    void lifecycle.closeTab(document).catch(showUnexpectedError);
  },
  documents: () => documentViews.documents(1)
    .map((id) => registry.get(id)).filter((value): value is DocumentRecord => value !== undefined),
  host: tabsHost,
  select: (document) => activateDocument(document),
  commandTarget: (document) => `1:${document.id}`,
  runCommand: (id, target) => documentCommands?.run(id, target),
});
const tabStripTwo = new TabStrip({
  active: () => secondaryDocument,
  close: (document) => { void lifecycle.closeTab(document).catch(showUnexpectedError); },
  documents: () => documentViews.documents(2)
    .map((id) => registry.get(id)).filter((value): value is DocumentRecord => value !== undefined),
  host: tabsTwoHost,
  select: activateSecondaryDocument,
  commandTarget: (document) => `2:${document.id}`,
  runCommand: (id, target) => documentCommands?.run(id, target),
});

function activateDocument(document: DocumentRecord): void {
  if (activeDocument === document) {
    editor.focus();
    return;
  }
  if (activeDocument) {
    activeDocument.state = editor.state;
    saveEditorViewState(activeDocument, 1, editor);
  }
  activeDocument = document;
  documentState.applyingDocument = true;
  editor.setState(editorStateForView(document, 1));
  documentState.applyingDocument = false;
  syncDocumentState(document);
  const scrollTop = documentViews.state(document.id, 1)?.scrollTop ?? document.scrollTop;
  editor.scrollDOM.scrollTop = scrollTop;
  requestAnimationFrame(() => {
    if (activeDocument === document) {
      editor.scrollDOM.scrollTop = scrollTop;
    }
  });
  updateTitle();
  tabStrip.render();
  showPreviewError();
  renderController.activate(document);
  mergeView.activate(document.id, document.state);
  editor.focus();
}

function activateSecondaryDocument(document: DocumentRecord): void {
  if (secondaryDocument) {
    saveEditorViewState(secondaryDocument, 2, editorTwo);
  }
  secondaryDocument = document;
  syncDocumentState(document, secondaryDocumentState);
  const state = documentViews.state(document.id, 2);
  editorTwo.setState(editorStateForView(document, 2));
  editorTwo.scrollDOM.scrollTop = state?.scrollTop ?? 0;
  tabStripTwo.render();
  editorTwo.focus();
}

function changeDocumentView(
  document: DocumentRecord,
  from: DocumentViewId,
  action: "clone" | "move",
): void {
  if (action === "clone") documentViews.clone(document.id, from);
  else documentViews.move(document.id, from);
  viewTwoHost.hidden = documentViews.documents(2).length === 0;
  workspace.classList.toggle("has-document-view-two", !viewTwoHost.hidden);
  if (documentViews.documents(2).includes(document.id)) activateSecondaryDocument(document);
  if (!documentViews.documents(1).includes(activeDocument?.id ?? "")) {
    const nextId = documentViews.documents(1)[0];
    const next = nextId === undefined ? undefined : registry.get(nextId);
    if (next) activateDocument(next);
  }
  tabStrip.render();
  tabStripTwo.render();
}

function runDocumentViewCommand(
  target: string,
  action: "clone" | "move",
): void {
  const separator = target.indexOf(":");
  const view = target.slice(0, separator);
  const document = registry.get(target.slice(separator + 1));
  if (document && (view === "1" || view === "2")) {
    changeDocumentView(document, view === "1" ? 1 : 2, action);
  }
}

function newDocument(input: {
  canonicalPath: string | null;
  grant: string | null;
  name: string | null;
  savedText: string;
  text: string;
}): DocumentRecord {
  const replication = new DocumentReplication();
  const document = createDocumentRecord({
    canonicalPath: input.canonicalPath,
    grant: input.grant,
    name: input.name,
    replication,
    savedText: Text.of(input.savedText.split("\n")),
    state: createEditorState(input.text, documentState, callbacks, markerMergeExtension),
  });
  registry.add(document);
  documentViews.add(document.id);
  const version = replication.current();
  const text = document.state.doc.toString();
  renderController.attach(document, text);
  window.setTimeout(() => detectMerge(document, text), 0);
  void attachDocument({ ...version, text }).then((result) => {
    valueOrStatus(result, document.name);
  }).catch(showUnexpectedError);
  return document;
}

function installMerge(document: DocumentRecord, source: string, merge: MarkerMergeState): void {
  if (!registry.get(document.id)) return;
  const spec = initializeMarkerMerge(document.state, source, merge);
  if (spec === null) return;
  if (activeDocument === document) {
    editor.dispatch(spec);
    mergeView.activate(document.id, editor.state);
  } else {
    document.state = document.state.update(spec).state;
  }
}

function detectMerge(document: DocumentRecord, text: string): void {
  mergeView.detect(document.id, text, (merge) => installMerge(document, text, merge));
}

function createUntitled(): DocumentRecord {
  return newDocument({
    canonicalPath: null,
    grant: null,
    name: null,
    savedText: "",
    text: "",
  });
}

function removePristineUntitled(): void {
  if (registry.size <= 1) {
    return;
  }
  const untouched = registry.all().find((document) =>
    document.grant === null && !document.dirty && document.state.doc.length === 0);
  if (untouched) {
    removeDocument(untouched);
  }
}

function valueOrStatus<T>(
  result: Result<T>,
  fileName: string | null = null,
): T | undefined {
  if (!result.ok) {
    showStatus(formatMessage(
      result.error.messageKey,
      messageParams(result.error.params, fileName),
    ));
    return undefined;
  }
  return result.value;
}

function showUnexpectedError(error: unknown): void {
  showStatus(error instanceof Error ? error.message : String(error));
}

function removeDocument(document: DocumentRecord): void {
  if (!registry.get(document.id)) {
    return;
  }
  const ordered = registry.all();
  const index = ordered.indexOf(document);
  registry.remove(document.id);
  documentViews.remove(document.id);
  if (secondaryDocument === document) {
    secondaryDocument = null;
    const nextId = documentViews.documents(2)[0];
    const next = nextId === undefined ? undefined : registry.get(nextId);
    if (next) activateSecondaryDocument(next);
    else {
      viewTwoHost.hidden = true;
      workspace.classList.remove("has-document-view-two");
    }
  }
  mergeView.forget(document.id);
  dirtyFrame.forget(document.id);
  detachDocument({ docId: document.id });
  renderController.detach(document.id);
  drafts.documentSaved(document.id);
  clearDraft({ docId: document.id });
  if (document.grant) {
    void lifecycle.releaseGrant(document.grant);
  }
  if (document === activeDocument) {
    activeDocument = null;
    const remaining = registry.all();
    const next = remaining[Math.max(0, index - 1)] ?? remaining[0] ?? null;
    if (next) {
      activateDocument(next);
    } else {
      preview.replaceChildren();
      documentState.applyingDocument = true;
      editor.setState(createEditorState("", documentState, callbacks, markerMergeExtension));
      documentState.applyingDocument = false;
      documentState.currentGrant = null;
      documentState.currentName = null;
      documentState.saved = Text.empty;
      documentState.dirty = false;
      updateTitle();
      tabStrip.render();
    }
  } else {
    tabStrip.render();
  }
}

lifecycle = new DocumentLifecycle({
  active: () => activeDocument,
  activate: activateDocument,
  drafts,
  flushDirty: () => dirtyFrame.flush(),
  newDocument,
  prompt,
  registry,
  remove: removeDocument,
  removePristineUntitled,
  showStatus,
  syncDirty,
});
new WorkspaceSidebar({
  elements: workspaceElements,
  openDocument: (reference) => lifecycle.openReference(reference),
  showStatus,
});
documentCommands = new DocumentCommands({
  compare: openCompare,
  editor: () => editorTwo.hasFocus ? editorTwo : editor,
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  otherView: runDocumentViewCommand,
  redo: () => runHistory("redo"),
  save: async (saveAs) => {
    const document = focusedDocument();
    if (document) await lifecycle.save(document, saveAs);
  },
  undo: () => runHistory("undo"),
});

onOpenRequest((request) => lifecycle.handleOpenRequest(request));
onSessionCloseRequest((request) => {
  void lifecycle.handleSessionClose(request).catch(showUnexpectedError);
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
});

async function initialize(): Promise<void> {
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = closePrompt.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (button) {
      button.textContent = formatMessage(`close.${action}`, {});
    }
  }
  renderController.start();
  wirePreviewLinks(preview, showStatus);
  const untitled = createUntitled();
  activateDocument(untitled);
  updateTitle();
  try {
    const ready = valueOrStatus(await readyForOpenRequests());
    if (ready) {
      windowId = ready.windowId;
      documentState.productName = ready.productName;
      secondaryDocumentState.productName = ready.productName;
      updateTitle();
      const recovered = await lifecycle.recover();
      if (!recovered) {
        await lifecycle.restoreSession();
      }
      if (ready.notice) {
        showStatus(ready.notice);
      }
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

void initialize();
