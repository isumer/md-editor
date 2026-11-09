import { Text, type ChangeSet, type EditorState } from "@codemirror/state";
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
  type EditorCallbacks,
} from "./editor/editor";
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
import { DocumentCommands } from "./tabs/documentCommands";
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
const documentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let statusFromPreview = false;
let editor: EditorView;
let editorTwo: EditorView;
let secondaryDocument: DocumentRecord | null = null;
let mirroring = false;
type EditEvent = "edit" | "redo" | "undo";
let historyEvent: EditEvent = "edit";
const secondaryStates = new Map<string, { state: EditorState; scrollTop: number }>();
const documentViews = new DocumentViews();
let mergeView: MergeView;
let lifecycle: DocumentLifecycle;
let documentCommands: DocumentCommands | null = null;

function showStatus(message = ""): void {
  statusFromPreview = false;
  status.textContent = message;
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
  document.title = documentTitle(documentState);
}

function syncDocumentState(document: DocumentRecord): void {
  documentState.currentGrant = document.grant;
  documentState.currentName = document.name;
  documentState.saved = document.saved.text;
  documentState.dirty = document.dirty;
}

function syncDirty(document: DocumentRecord): void {
  tabStrip.update(document);
  tabStripTwo.update(document);
  if (document !== activeDocument) {
    return;
  }
  syncDocumentState(document);
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
    const document = activeDocument;
    if (document) {
      // Every update, including a selection change, is the tab's view state.
      document.state = editor.state;
      document.scrollTop = editor.scrollDOM.scrollTop;
      dirtyFrame.changed(document);
    }
    renderController.schedule();
  },
  onChanges: (changes, state) => {
    const document = activeDocument;
    if (!document) {
      return;
    }
    document.state = state;
    if (mirroring) return;
    mirrorChange(editorTwo, changes, historyEvent);
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: (state) => {
    documentCommands?.refresh();
    mergeView?.stateChanged(activeDocument?.id ?? null, state);
  },
};

editor = createEditor(editorHost, documentState, callbacks);
const secondaryCallbacks: EditorCallbacks = {
  onDocumentChanged: () => {
    const document = secondaryDocument;
    if (document) secondaryStates.set(document.id, {
      state: editorTwo.state,
      scrollTop: editorTwo.scrollDOM.scrollTop,
    });
  },
  onChanges: (changes, state) => {
    const document = secondaryDocument;
    if (!document) return;
    secondaryStates.set(document.id, {
      state,
      scrollTop: editorTwo.scrollDOM.scrollTop,
    });
    if (mirroring) return;
    if (activeDocument === document) {
      mirrorChange(editor, changes, historyEvent);
    } else {
      document.state = document.state.update({ changes }).state;
    }
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: () => documentCommands?.refresh(),
};
editorTwo = createEditor(editorTwoHost, documentState, secondaryCallbacks);

function mirrorChange(
  peer: EditorView,
  changes: ChangeSet,
  event: EditEvent,
): void {
  if (!activeDocument || activeDocument !== secondaryDocument) return;
  mirroring = true;
  try {
    if (event === "undo") dispatchUndo(peer);
    else if (event === "redo") dispatchRedo(peer);
    else peer.dispatch({ changes });
  } finally {
    mirroring = false;
  }
}

function runHistory(event: "redo" | "undo"): void {
  historyEvent = event;
  try {
    const activeEditor = editorTwo.hasFocus ? editorTwo : editor;
    if (event === "undo") dispatchUndo(activeEditor);
    else dispatchRedo(activeEditor);
  } finally {
    historyEvent = "edit";
  }
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
  otherView: (document, action) => changeDocumentView(document, 1, action),
});
const tabStripTwo = new TabStrip({
  active: () => secondaryDocument,
  close: (document) => { void lifecycle.closeTab(document).catch(showUnexpectedError); },
  documents: () => documentViews.documents(2)
    .map((id) => registry.get(id)).filter((value): value is DocumentRecord => value !== undefined),
  host: tabsTwoHost,
  select: activateSecondaryDocument,
  otherView: (document, action) => changeDocumentView(document, 2, action),
});

function activateDocument(document: DocumentRecord): void {
  if (activeDocument === document) {
    editor.focus();
    return;
  }
  if (activeDocument) {
    activeDocument.state = editor.state;
    activeDocument.scrollTop = editor.scrollDOM.scrollTop;
  }
  activeDocument = document;
  documentState.applyingDocument = true;
  editor.setState(document.state);
  documentState.applyingDocument = false;
  syncDocumentState(document);
  editor.scrollDOM.scrollTop = document.scrollTop;
  requestAnimationFrame(() => {
    if (activeDocument === document) {
      editor.scrollDOM.scrollTop = document.scrollTop;
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
    secondaryStates.set(secondaryDocument.id, {
      state: editorTwo.state,
      scrollTop: editorTwo.scrollDOM.scrollTop,
    });
  }
  secondaryDocument = document;
  const saved = secondaryStates.get(document.id);
  const state = saved?.state ?? createEditorState(
    document.state.doc,
    documentState,
    secondaryCallbacks,
    markerMergeExtension,
  );
  editorTwo.setState(state);
  editorTwo.scrollDOM.scrollTop = saved?.scrollTop ?? 0;
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
  secondaryStates.delete(document.id);
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
documentCommands = new DocumentCommands({
  editor: () => editorTwo.hasFocus ? editorTwo : editor,
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  redo: () => runHistory("redo"),
  save: (saveAs) => lifecycle.saveActive(saveAs),
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
