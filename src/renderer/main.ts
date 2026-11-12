import { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import {
  applyFontSizeChange,
  createAppearanceController,
} from "./appearance";
import { formatMessage } from "./core/messages";
import { DraftScheduler } from "./core/draftScheduler";
import {
  createDocumentRecord,
  createDocumentState,
  documentTitle,
  isDocumentDirty,
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
  type EditorCallbacks,
} from "./editor/editor";
import type { InstalledFeatures } from "./editor/featureWiring";
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
  readyForOpenRequests,
  saveSettings,
  sendChanges,
} from "./platform/api";
import { rendererElements } from "./platform/dom";
import { startRenderer, wireWindow } from "./startup";
import { createStatusSurface } from "./status";
import { DocumentClosePrompt } from "./tabs/closePrompt";
import { DocumentCommands } from "./tabs/documentCommands";
import { DocumentLifecycle } from "./tabs/documentLifecycle";
import { RenderController } from "./tabs/renderController";
import { TabStrip } from "./tabs/tabStrip";
import "./styles.css";
import "./features/theme/theme.css";
import "./features/preview/preview.css";

const {
  editorHost,
  workspace,
  preview,
  previewError,
  status,
  tabsHost,
  closePrompt,
  closePromptMessage,
} = rendererElements();
const documentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let editor: EditorView;
let lifecycle: DocumentLifecycle;
let documentCommands: DocumentCommands | null = null;
let installedFeatures: InstalledFeatures;

const {
  show: showStatus,
  showPreview: showPreviewStatus,
  showPreviewError,
  valueOrStatus,
  unexpected: showUnexpectedError,
} = createStatusSurface(status, previewError);

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
  rewriteHtml: (html) => rewriteFeatureHtml(html, {
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
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderController.change(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: (state) => {
    documentCommands?.refresh();
    installedFeatures.documentStateChanged(activeDocument?.id ?? null, state);
  },
};

editor = createEditor(editorHost, documentState, callbacks);
const settingsController = createAppearanceController({
  load: loadSettings,
  save: saveSettings,
});
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
  documents: () => registry.all(),
  host: tabsHost,
  select: (document) => activateDocument(document),
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
  installedFeatures.documentActivated(document);
  editor.focus();
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
  registry.add(document);
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

function removeDocument(document: DocumentRecord): void {
  if (!registry.get(document.id)) {
    return;
  }
  const ordered = registry.all();
  const index = ordered.indexOf(document);
  registry.remove(document.id);
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
  flushDirty: () => dirtyFrame.flush(),
  newDocument,
  prompt,
  registry,
  remove: removeDocument,
  removePristineUntitled,
  showStatus,
  syncDirty,
});

function changeFontSize(delta: number): void {
  applyFontSizeChange(
    settingsController,
    delta,
    showStatus,
    showUnexpectedError,
  );
}

documentCommands = new DocumentCommands({
  compare: () => installedFeatures.runCommand("file.compareOpen"),
  decreaseFontSize: () => changeFontSize(-1),
  editor,
  increaseFontSize: () => changeFontSize(1),
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  save: (saveAs) => lifecycle.saveActive(saveAs),
});

wireWindow(lifecycle, showUnexpectedError);

void startRenderer({
  closePrompt,
  settings: settingsController,
  render: renderController,
  features: installedFeatures,
  lifecycle,
  openInitialDocument: () => {
    const untitled = createUntitled();
    activateDocument(untitled);
    updateTitle();
  },
  requestOpenRequests: readyForOpenRequests,
  unwrap: valueOrStatus,
  onReady: (ready) => {
    windowId = ready.windowId;
    documentState.productName = ready.productName;
    updateTitle();
  },
  showStatus,
  showError: showUnexpectedError,
}).catch(showUnexpectedError);
