/* eslint-disable max-lines -- Application composition stays in one entry module. */
import { Text, Transaction, type ChangeSet, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { Result } from "../shared/ipc/result";
import { parseHexColor, relativeLuminance } from "../shared/settings/appearance";
import { formatMessage } from "./core/messages";
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
  setEditorDarkTheme,
  type EditorCallbacks,
} from "./editor/editor";
import type { InstalledFeatures } from "./editor/featureWiring";
import {
  applyBackgrounds,
  resetToThemeDefaults,
  resolveSystemTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "./features/background/background";
import { beginStartup } from "./features/background/startup";
import {
  featureEditorExtensions,
  installFeatures,
  rewriteFeatureHtml,
} from "./features/registry";
import renderWorkerUrl from "./workers/render/render.worker.ts?worker&url";
import {
  attachDocument,
  clearDraft,
  detachDocument,
  loadSettings,
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
const stateViews = new Map<string, DocumentViewId>();
let lifecycle: DocumentLifecycle;
let documentCommands: DocumentCommands | null = null;
let installedFeatures: InstalledFeatures;

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
  rewriteHtml: (html) => rewriteFeatureHtml(html, {
    windowId,
    grant: activeDocument?.grant ?? null,
  }),
  showError: showPreviewError,
  showStatus: showPreviewStatus,
  workerUrl: new URL(renderWorkerUrl, window.location.href),
});

interface PendingDocumentChange {
  readonly changes: ChangeSet;
  readonly document: DocumentRecord;
}

let pendingDocumentChanges: PendingDocumentChange[] = [];
let documentChangeTimer: number | null = null;
let pendingFeatureState: { documentId: string | null; state: EditorState } | null = null;
let stateChangeFrame: number | null = null;

function queueStateChanged(state?: EditorState): void {
  if (state !== undefined) {
    pendingFeatureState = { documentId: activeDocument?.id ?? null, state };
  }
  stateChangeFrame ??= requestAnimationFrame(() => {
    stateChangeFrame = null;
    documentCommands?.refresh();
    const pending = pendingFeatureState;
    pendingFeatureState = null;
    if (pending !== null) {
      installedFeatures.documentStateChanged(pending.documentId, pending.state);
    }
  });
}

function flushDocumentChanges(): void {
  if (documentChangeTimer !== null) {
    window.clearTimeout(documentChangeTimer);
    documentChangeTimer = null;
  }
  const pending = pendingDocumentChanges;
  pendingDocumentChanges = [];
  for (const change of pending) {
    const message = change.document.replication.changed(change.changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(change.document);
  }
  if (pending.some((change) => change.document === activeDocument)) {
    renderController.schedule();
  }
}

function queueDocumentChange(document: DocumentRecord, changes: ChangeSet): void {
  pendingDocumentChanges.push({ changes, document });
  documentChangeTimer ??= window.setTimeout(flushDocumentChanges, 0);
}

const callbacks: EditorCallbacks = {
  deferDirtyState: true,
  onDocumentChanged: () => undefined,
  onChanges: (changes, state) => {
    if (mirroring) return;
    const document = activeDocument;
    if (!document) {
      return;
    }
    stateViews.set(document.id, 1);
    document.state = state;
    syncPeerEditor(document, 1, changes);
    queueDocumentChange(document, changes);
  },
  onStateChanged: (state) => {
    if (mirroring) return;
    queueStateChanged(state);
  },
};

editor = createEditor(editorHost, documentState, callbacks);
const secondaryCallbacks: EditorCallbacks = {
  deferDirtyState: true,
  onDocumentChanged: () => undefined,
  onChanges: (changes, state) => {
    if (mirroring) return;
    const document = secondaryDocument;
    if (!document) return;
    stateViews.set(document.id, 2);
    document.state = state;
    syncPeerEditor(document, 2, changes);
    queueDocumentChange(document, changes);
  },
  onStateChanged: () => {
    if (!mirroring) queueStateChanged();
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
  const document = view === 1 ? activeDocument : secondaryDocument;
  if (document) {
    syncDocumentState(document, view === 1 ? documentState : secondaryDocumentState);
    updateTitle();
  }
}

editor.contentDOM.addEventListener("focus", () => focusEditor(1));
editorTwo.contentDOM.addEventListener("focus", () => focusEditor(2));
editor.contentDOM.addEventListener("blur", () => {
  if (activeDocument) saveEditorViewState(activeDocument, 1, editor);
});
editorTwo.contentDOM.addEventListener("blur", () => {
  if (secondaryDocument) saveEditorViewState(secondaryDocument, 2, editorTwo);
});

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
  const stored = documentViews.state(document.id, view);
  if (stateViews.get(document.id) === view && stored === undefined) {
    return document.state;
  }
  const next = document.state.update({
    annotations: Transaction.addToHistory.of(false),
    effects: editorCallbacksEffect(
      view === 1 ? documentState : secondaryDocumentState,
      view === 1 ? callbacks : secondaryCallbacks,
    ),
    selection: stored?.selection ?? document.state.selection,
  }).state;
  stateViews.set(document.id, view);
  return next;
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
  const peerDocumentState = peerView === 1 ? documentState : secondaryDocumentState;
  mirroring = true;
  peerDocumentState.applyingDocument = true;
  try {
    peer.dispatch({
      annotations: Transaction.addToHistory.of(false),
      changes,
      filter: false,
    });
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
installedFeatures = installFeatures({
  documents: () => registry.all(),
  editorHost,
  preview,
  workspace,
  editor,
  hasDocument: (documentId) => registry.get(documentId) !== undefined,
  isActive: (document) => activeDocument === document,
  openDocument: (reference) => lifecycle.openReference(reference),
  showStatus,
});

const drafts = new DraftScheduler({
  onDraft: (docId) => lifecycle.sendDraft(docId),
});

// Dirty state runs after paint when the renderer has idle time.
const dirtyFrame = new FrameCoalescer<DocumentRecord>({
  requestFrame: (callback) => {
    requestAnimationFrame(() => window.requestIdleCallback(() => callback(), {
      timeout: 32,
    }));
  },
  apply: (document) => {
    performance.mark("dirty-state-start");
    if (registry.get(document.id)) {
      document.dirty = isDocumentDirty(document);
      if (document.dirty) {
        drafts.documentChanged(document.id, document.state.doc.length);
      } else {
        drafts.documentSaved(document.id);
      }
      syncDirty(document);
    }
    performance.mark("dirty-state-end");
  },
});

const prompt = new DocumentClosePrompt(closePrompt, closePromptMessage);
const tabStrip = new TabStrip({
  active: () => activeDocument,
  close: (document) => closeTabInView(document, 1),
  documents: () => documentViews.documents(1)
    .map((id) => registry.get(id)).filter((value): value is DocumentRecord => value !== undefined),
  host: tabsHost,
  select: (document) => activateDocument(document),
  commandTarget: (document) => `1:${document.id}`,
  runCommand: (id, target) => documentCommands?.run(id, target),
});
const tabStripTwo = new TabStrip({
  active: () => secondaryDocument,
  close: (document) => closeTabInView(document, 2),
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
    if (stateViews.get(activeDocument.id) === 1) {
      activeDocument.state = editor.state;
    }
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
  installedFeatures.documentActivated(document);
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
  reconcileDocumentViews(document);
}

// Closing one tab of a document that lives in both views drops only that
// view's membership; the document, text, history, grant and drafts stay.
function closeTabInView(document: DocumentRecord, view: DocumentViewId): void {
  const inBothViews = documentViews.documents(1).includes(document.id)
    && documentViews.documents(2).includes(document.id);
  if (!inBothViews) {
    void lifecycle.closeTab(document).catch(showUnexpectedError);
    return;
  }
  documentViews.removeFromView(document.id, view);
  reconcileDocumentViews(document);
}

function reconcileDocumentViews(document: DocumentRecord): void {
  const secondaryIds = documentViews.documents(2);
  viewTwoHost.hidden = secondaryIds.length === 0;
  workspace.classList.toggle("has-document-view-two", !viewTwoHost.hidden);
  if (!secondaryIds.includes(secondaryDocument?.id ?? "")) {
    secondaryDocument = null;
    const nextId = secondaryIds[0];
    const next = nextId === undefined ? undefined : registry.get(nextId);
    if (next) activateSecondaryDocument(next);
  }
  if (secondaryIds.includes(document.id)) activateSecondaryDocument(document);
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
  const version = replication.current();
  // Without "\r" the editor splits lines like split("\n") and its text equals
  // the input. The render worker then gets the text before the editor state
  // exists and splits its copy while this thread builds the state.
  const isLineFeedOnly = !input.text.includes("\r");
  if (isLineFeedOnly) {
    renderController.attachVersion(version, input.text);
  }
  const state = createEditorState(
    input.text,
    documentState,
    callbacks,
    featureEditorExtensions,
  );
  const document = createDocumentRecord({
    canonicalPath: input.canonicalPath,
    grant: input.grant,
    name: input.name,
    replication,
    // A freshly opened file shares the editor's Text: no second split, and
    // the dirty check compares one object instead of every line.
    savedText: isLineFeedOnly && input.savedText === input.text
      ? state.doc
      : Text.of(input.savedText.split("\n")),
    state,
  });
  stateViews.set(document.id, 1);
  registry.add(document);
  documentViews.add(document.id);
  const text = isLineFeedOnly ? input.text : state.doc.toString();
  if (!isLineFeedOnly) {
    renderController.attach(document, text);
  }
  window.setTimeout(() => installedFeatures?.documentCreated(document, text), 0);
  void attachDocument({ ...version, text }).then((result) => {
    valueOrStatus(result, document.name);
  }).catch(showUnexpectedError);
  return document;
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
  flushDocumentChanges();
  const ordered = registry.all();
  const index = ordered.indexOf(document);
  registry.remove(document.id);
  stateViews.delete(document.id);
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
  installedFeatures.documentRemoved(document.id);
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
      editor.setState(createEditorState(
        "",
        documentState,
        callbacks,
        featureEditorExtensions,
      ));
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
  flushDirty: () => {
    flushDocumentChanges();
    dirtyFrame.flush();
  },
  newDocument,
  prompt,
  registry,
  remove: removeDocument,
  removePristineUntitled,
  showStatus,
  syncDirty,
});
documentCommands = new DocumentCommands({
  compare: () => installedFeatures.runCommand("file.compareOpen"),
  editor: () => editorTwo.hasFocus ? editorTwo : editor,
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  merge: () => installedFeatures.runCommand("file.mergeOpen"),
  otherView: runDocumentViewCommand,
  redo: () => runHistory("redo"),
  save: async (saveAs) => {
    const document = focusedDocument();
    if (document) {
      flushDocumentChanges();
      await lifecycle.save(document, saveAs);
    }
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

async function loadBackgroundSettings(): Promise<void> {
  const settingsResult = await loadSettings();
  const applyTheme = (theme: ResolvedTheme): void => {
    const editorText = settingsResult.ok
      ? applyBackgrounds(
        { editor: settingsResult.value.editor.background, preview: settingsResult.value.preview.background },
        theme,
      )
      : resetToThemeDefaults(theme);
    const colour = parseHexColor(editorText);
    const dark = colour !== null && relativeLuminance(colour) > 0.5;
    setEditorDarkTheme(editor, dark);
    setEditorDarkTheme(editorTwo, dark);
  };
  applyTheme(resolveSystemTheme());
  watchSystemTheme(applyTheme);
}

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
  installedFeatures.start();
  const readyRequest = beginStartup({
    openInitialDocument: () => {
      const untitled = createUntitled();
      activateDocument(untitled);
      updateTitle();
    },
    requestOpenRequests: readyForOpenRequests,
    loadSettings: loadBackgroundSettings,
    showError: showUnexpectedError,
  });
  try {
    const ready = valueOrStatus(await readyRequest);
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

void initialize().catch(showUnexpectedError);
