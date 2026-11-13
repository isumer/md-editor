/* eslint-disable max-lines -- Application composition stays in one entry module. */
import {
  Text,
  type EditorState,
  type Extension,
} from "@codemirror/state";
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
  type ReplicatedVersion,
} from "./core/replication";
import {
  createEditor,
  createEditorState,
  markerMergeExtension,
  setEditorDarkTheme,
  type EditorCallbacks,
} from "./editor/editor";
import {
  applyBackgrounds,
  resetToThemeDefaults,
  resolveSystemTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from "./features/background/background";
import { beginStartup } from "./features/background/startup";
import {
  type DeferredInstalledFeatures,
  featureEditorExtensions,
  installFeatures,
  rewriteFeatureHtml,
} from "./features/registry";
import {
  attachDocument,
  clearDraft,
  detachDocument,
  loadSettings,
  onOpenRequest,
  onSessionCloseRequest,
  readyForOpenRequests,
  sendChanges,
  toggleFullScreen,
} from "./platform/api";
import { DocumentClosePrompt } from "./tabs/closePrompt";
import { DocumentCommands } from "./tabs/documentCommands";
import { createSecondaryDocumentCommands } from "./tabs/documentCommandsSecondary";
import { DocumentLifecycle } from "./tabs/documentLifecycle";
import { RenderController } from "./tabs/renderController";
import { TabStrip } from "./tabs/tabStrip";
import renderWorkerUrl from "./workers/render/render.worker.ts?worker&url";
import "./styles.css";

const startupMarks = new Set<string>();

function markStartup(name: string): void {
  if (startupMarks.has(name)) return;
  startupMarks.add(name);
  performance.mark(name);
}

markStartup("renderer-script-start");
markStartup("renderer-main-start");

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
const workspaceOpen = requiredElement<HTMLButtonElement>("#workspace-open");
const documentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let statusFromPreview = false;
let editor: EditorView;
let lifecycle: DocumentLifecycle;
let documentCommands: DocumentCommands | null = null;
let installedFeatures: DeferredInstalledFeatures;
let firstEditQueued = false;
let workspaceFeatureInstalled = false;
let workspaceOpenPending = false;

function currentFeatureExtensions(): Extension {
  return [featureEditorExtensions, markerMergeExtension];
}

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
    }
    renderController.schedule();
    if (document) {
      dirtyFrame.changed(document);
    }
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
    markFirstEditAfterPaint();
  },
  onStateChanged: (state) => {
    documentCommands?.refresh();
    installedFeatures.documentStateChanged(activeDocument?.id ?? null, state);
  },
};

editor = createEditor(editorHost, documentState, callbacks);
markStartup("editor-mounted");
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
    markStartup("file-text-shown");
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
    markStartup("editor-editable");
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
    currentFeatureExtensions(),
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
  if (text.includes("<<<<<<<")) {
    void installMergeFeature().catch(showUnexpectedError);
  }
  attachIoMirror(version, text, document.name);
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

function attachIoMirror(
  version: ReplicatedVersion,
  text: string,
  fileName: string | null,
): void {
  const attach = (): void => {
    if (registry.get(version.docId) === undefined) return;
    void attachDocument({ ...version, text }).then((result) => {
      valueOrStatus(result, fileName);
    }).catch(showUnexpectedError);
  };
  if (text.length > 2 * 1024 * 1024) {
    window.setTimeout(attach, 1_500);
    return;
  }
  attach();
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
        currentFeatureExtensions(),
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
  editor,
  loadSecondary: () => Promise.resolve(
    createSecondaryDocumentCommands({
      compare: () => {
        void openCompare().catch(showUnexpectedError);
      },
      merge: () => {
        void openMerge().catch(showUnexpectedError);
      },
    }),
  ),
  featureCommand: (commandId) => installedFeatures.runCommand(commandId),
  onError: showUnexpectedError,
  onResult: (result) => {
    valueOrStatus(result);
  },
  open: () => lifecycle.open(),
  save: (saveAs) => lifecycle.saveActive(saveAs),
  toggleFullScreen: async () => {
    valueOrStatus(await toggleFullScreen());
  },
});

async function openCompare(): Promise<void> {
  const { compareFeature } = await import("./features/compare/wiring");
  installedFeatures.installDeferred([compareFeature]);
  installedFeatures.runCommand("file.compareOpen");
}

async function installMergeFeature(): Promise<void> {
  const { mergeFeature } = await import("./features/merge/wiring");
  installedFeatures.installDeferred([mergeFeature]);
}

async function openMerge(): Promise<void> {
  await installMergeFeature();
  installedFeatures.runCommand("file.mergeOpen");
}

async function installWorkspaceFeature(): Promise<void> {
  const { workspaceFeature } = await import(
    "./features/workspace/workspaceSidebar"
  );
  installedFeatures.installDeferred([workspaceFeature]);
  workspaceFeatureInstalled = true;
  if (workspaceOpenPending) {
    workspaceOpenPending = false;
    workspaceOpen.click();
  }
}

workspaceOpen.addEventListener("click", () => {
  if (workspaceFeatureInstalled) return;
  workspaceOpenPending = true;
  void installWorkspaceFeature().catch(showUnexpectedError);
});

function markFirstEditAfterPaint(): void {
  if (firstEditQueued) return;
  firstEditQueued = true;
  markStartup("first-edit-start");
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      markStartup("first-edit-painted");
    }, 0);
  });
}

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
    setEditorDarkTheme(editor, colour !== null && relativeLuminance(colour) > 0.5);
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
  installedFeatures.start();
  renderController.start();
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
  documentCommands?.startSecondaryFeatures();
}

void initialize().catch(showUnexpectedError);
