/* eslint-disable max-lines -- Application composition stays in one entry module. */
import { Text, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { Result } from "../shared/ipc/result";
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
import "./styles.css";

performance.mark("renderer-script-start");

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
const closePrompt = requiredElement<HTMLElement>("#close-prompt");
const closePromptMessage = requiredElement<HTMLElement>("#close-prompt-message");
const documentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let statusFromPreview = false;
let editor: EditorView;
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
performance.mark("editor-mounted");
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
  if (document.grant !== null) {
    performance.mark("file-text-shown");
  }
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
  if (document.grant !== null) {
    performance.mark("editor-editable");
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
    state: createEditorState(
      input.text,
      documentState,
      callbacks,
      featureEditorExtensions,
    ),
  });
  registry.add(document);
  const version = replication.current();
  const text = document.state.doc.toString();
  renderController.attach(document, text);
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
documentCommands = new DocumentCommands({
  compare: () => installedFeatures.runCommand("file.compareOpen"),
  editor,
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  save: (saveAs) => lifecycle.saveActive(saveAs),
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
  installedFeatures.start();
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
