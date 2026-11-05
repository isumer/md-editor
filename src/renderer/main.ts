import { Text, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { DocumentReference } from "../shared/ipc/file";
import type { DraftDocument } from "../shared/ipc/io";
import type {
  MenuCommandMessage,
  MenuContribution,
  MenuItemId,
} from "../shared/ipc/menu";
import type { Result } from "../shared/ipc/result";
import type { SessionCloseRequest } from "../shared/ipc/session";
import { formatMessage } from "../shared/messages/en";
import type {
  RenderAttachMessage,
  RenderResponse,
  RenderResync,
} from "../shared/workers/render";
import {
  closeFileMessage,
  closeDocumentsMessage,
  resolveClosePrompt,
  type CloseAnswer,
} from "./core/closePrompt";
import { createCommandRegistry } from "./core/commands";
import { createContextKeys } from "./core/contextKeys";
import { DraftScheduler } from "./core/draftScheduler";
import {
  createDocumentRecord,
  createDocumentState,
  documentTitle,
  isDocumentDirty,
  markDocumentSaved,
  messageParams,
  type DocumentRecord,
} from "./core/document";
import { DocumentRegistry } from "./core/documentRegistry";
import { FrameCoalescer } from "./core/frameCoalescer";
import { WorkerHeartbeat } from "./core/heartbeat";
import { installKeymap } from "./core/keymap";
import {
  DocumentReplication,
  saveReplicatedDocument,
  type ReplicatedVersion,
} from "./core/replication";
import {
  createEditor,
  createEditorState,
  dispatchRedo,
  dispatchUndo,
  type EditorCallbacks,
} from "./editor/editor";
import {
  wirePreviewLinks,
  wireRenderWorker,
} from "./features/preview/preview";
import { RenderScheduler } from "./features/preview/renderScheduler";
import { rewriteAssetUrls } from "./features/preview/rewriteAssets";
import renderWorkerUrl from "./workers/render/render.worker.ts?worker&url";
import {
  attachDocument,
  chooseSaveTarget,
  clearDraft,
  contributeMenu,
  detachDocument,
  draftDocument,
  listDrafts,
  loadSession,
  onMenuCommand,
  onOpenRequest,
  onSessionCloseRequest,
  openFile,
  openPath,
  pathForFile,
  readDocument,
  readyForOpenRequests,
  releaseDocument,
  respondSessionClose,
  saveDocument as saveDocumentVersion,
  sendChanges,
} from "./platform/api";
import "./styles.css";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

interface RenderWorkerPort {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

function defaultRenderWorkerFactory(url: URL): RenderWorkerPort {
  return new Worker(url, { type: "module" });
}

const editorHost = requiredElement<HTMLElement>("#editor");
const preview = requiredElement<HTMLElement>("#preview");
const previewError = requiredElement<HTMLElement>("#preview-error");
const status = requiredElement<HTMLElement>("#status");
const tabsHost = requiredElement<HTMLElement>("#tabs");
const closePrompt = requiredElement<HTMLElement>("#close-prompt");
const closePromptMessage = requiredElement<HTMLElement>("#close-prompt-message");
const renderWorkerUrlValue = new URL(renderWorkerUrl, window.location.href);

let renderWorker = defaultRenderWorkerFactory(renderWorkerUrlValue);
const documentState = createDocumentState();
const registry = new DocumentRegistry();
let activeDocument: DocumentRecord | null = null;
let windowId: number | null = null;
let statusFromPreview = false;
let editor: EditorView;
let closePromptResolve: ((answer: CloseAnswer) => void) | null = null;

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
  updateTabRow(document);
  if (document !== activeDocument) {
    return;
  }
  syncDocumentState(document);
  updateTitle();
}

interface RenderHandlers {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

const workerHandlers: RenderHandlers = { onmessage: null, onerror: null };

const workerProxy = {
  postMessage(message: unknown): void {
    renderWorker.postMessage(message);
  },
  get onmessage() {
    return workerHandlers.onmessage;
  },
  set onmessage(handler: ((event: MessageEvent<RenderResponse>) => void) | null) {
    workerHandlers.onmessage = handler;
  },
  get onerror() {
    return workerHandlers.onerror;
  },
  set onerror(handler: ((event: ErrorEvent) => void) | null) {
    workerHandlers.onerror = handler;
  },
};

function installWorkerHandlers(): void {
  renderWorker.onmessage = (event) => {
    const response = event.data;
    if ("op" in response && response.op === "pong") {
      heartbeat.pong(response.id);
      return;
    }
    workerHandlers.onmessage?.(event);
  };
  renderWorker.onerror = (event) => {
    workerHandlers.onerror?.(event);
  };
}

const scheduler = new RenderScheduler((request) => {
  const document = activeDocument;
  if (!document) {
    return;
  }
  const version = document.replication.current();
  if (request.show === true) {
    renderWorker.postMessage({ op: "show", id: request.id, ...version });
    return;
  }
  renderWorker.postMessage({
    op: "render",
    id: request.id,
    ...version,
  });
}, {
  onApplied: (latency) => {
    const end = performance.now();
    performance.measure("preview-latency", { start: end - latency, end });
  },
});

function reattachActiveDocument(): void {
  const document = activeDocument;
  if (!document) {
    return;
  }
  renderWorker.postMessage({
    op: "attach",
    ...document.replication.current(),
    text: document.state.doc.toString(),
  } satisfies RenderAttachMessage);
  scheduler.schedule();
}

function restartRenderWorker(): void {
  try {
    renderWorker.terminate();
  } catch {
    // A worker that already exited needs no termination.
  }
  renderWorker = defaultRenderWorkerFactory(renderWorkerUrlValue);
  installWorkerHandlers();
  preview.replaceChildren();
  showPreviewError(formatMessage("preview.workerRestarted", {}));
  reattachActiveDocument();
  heartbeat.stop();
  heartbeat.start();
}

const heartbeat = new WorkerHeartbeat({
  onPing: (id) => {
    try {
      renderWorker.postMessage({ op: "ping", id });
    } catch {
      restartRenderWorker();
    }
  },
  onStuck: () => restartRenderWorker(),
});

function resyncRenderWorker(response: RenderResync): void {
  const document = activeDocument;
  const current = document?.replication.current();
  if (!document || !current || response.docId !== current.docId ||
    response.epoch !== current.epoch || response.version > current.version) {
    return;
  }
  renderWorker.postMessage({
    op: "attach",
    ...current,
    text: document.state.doc.toString(),
  } satisfies RenderAttachMessage);
  scheduler.schedule();
}

const callbacks: EditorCallbacks = {
  onDocumentChanged: () => {
    const document = activeDocument;
    if (document) {
      // Every update, including a selection change, is the tab's view state.
      document.state = editor.state;
      document.scrollTop = editor.scrollDOM.scrollTop;
      dirtyFrame.changed(document);
    }
    scheduler.schedule();
  },
  onChanges: (changes, state) => {
    const document = activeDocument;
    if (!document) {
      return;
    }
    document.state = state;
    const message = document.replication.changed(changes);
    sendChanges(message);
    renderWorker.postMessage(message);
    dirtyFrame.changed(document);
  },
  updateTitle,
  onStateChanged: () => refreshContextKeys(),
};

editor = createEditor(editorHost, documentState, callbacks);

const drafts = new DraftScheduler({
  onDraft: (docId) => sendDraft(docId),
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

const contextKeys = createContextKeys();
const commandContext = { contextKeys };
const commands = createCommandRegistry();
const menuItemCommands: Readonly<Record<MenuItemId, string>> = {
  "file-open": "file.open",
  "file-save": "file.save",
  "file-save-as": "file.saveAs",
};

function refreshContextKeys(): void {
  const keys = new Set<string>();
  if (editor.hasFocus) {
    keys.add("editorFocus");
  }
  if (editor.state.selection.ranges.some((range) => !range.empty)) {
    keys.add("hasSelection");
  }
  contextKeys.set(keys);
}

function platformName(): string {
  if (navigator.platform.startsWith("Mac")) {
    return "darwin";
  }
  return navigator.platform.startsWith("Win") ? "win32" : "linux";
}

commands.register({
  id: "file.open",
  titleKey: "menu.open",
  run: () => openDocument(),
});
commands.register({
  id: "file.save",
  titleKey: "menu.save",
  run: () => saveActiveDocument(false),
});
commands.register({
  id: "file.saveAs",
  titleKey: "menu.saveAs",
  run: () => saveActiveDocument(true),
});
commands.register({
  id: "undo",
  titleKey: "menu.undo",
  run: () => {
    dispatchUndo(editor);
  },
});
commands.register({
  id: "redo",
  titleKey: "menu.redo",
  run: () => {
    dispatchRedo(editor);
  },
});

function menuContribution(): MenuContribution {
  return {
    fileMenuTitle: formatMessage("menu.file", {}),
    items: [
      { id: "file-open", title: formatMessage("menu.open", {}), accelerator: "CmdOrCtrl+O" },
      { id: "file-save", title: formatMessage("menu.save", {}), accelerator: "CmdOrCtrl+S" },
      {
        id: "file-save-as",
        title: formatMessage("menu.saveAs", {}),
        accelerator: "CmdOrCtrl+Shift+S",
      },
    ],
  };
}

async function publishMenuContribution(): Promise<void> {
  valueOrStatus(await contributeMenu(menuContribution()));
}

function runMenuCommand(menuItemId: MenuCommandMessage): void {
  const commandId = menuItemCommands[menuItemId];
  if (commandId !== undefined) {
    void commands.run(commandId, commandContext, undefined, "menu");
  }
}

onMenuCommand(runMenuCommand);
installKeymap(document, {
  registry: commands,
  context: commandContext,
  platform: platformName(),
});
refreshContextKeys();
editor.contentDOM.addEventListener("focus", refreshContextKeys);
editor.contentDOM.addEventListener("blur", refreshContextKeys);
void publishMenuContribution().catch(showUnexpectedError);

function tabLabel(document: DocumentRecord): string {
  return document.name ?? "Untitled";
}

interface TabRow {
  element: HTMLDivElement;
  name: HTMLSpanElement;
  dirty: HTMLSpanElement;
  close: HTMLButtonElement;
}

const tabRows = new Map<string, TabRow>();

function renderTabs(): void {
  tabsHost.replaceChildren();
  tabRows.clear();
  for (const tabDocument of registry.all()) {
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.dataset["testid"] = "tab";
    tab.dataset["docId"] = tabDocument.id;
    tab.dataset["name"] = tabLabel(tabDocument);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(tabDocument === activeDocument));
    tab.tabIndex = tabDocument === activeDocument ? 0 : -1;

    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = tabLabel(tabDocument);

    const dirty = document.createElement("span");
    dirty.className = "tab-dirty";
    dirty.dataset["testid"] = "tab-dirty";
    dirty.textContent = "•";
    dirty.hidden = !tabDocument.dirty;
    dirty.setAttribute("aria-label", formatMessage("tab.unsaved", {}));

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.dataset["testid"] = "tab-close";
    close.setAttribute("aria-label", formatMessage("tab.close", {
      file: tabLabel(tabDocument),
    }));
    close.textContent = "×";
    close.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
      void closeTab(tabDocument).catch(showUnexpectedError);
    });
    tab.addEventListener("click", () => activateDocument(tabDocument));
    tab.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        void closeTab(tabDocument).catch(showUnexpectedError);
      }
    });
    tab.append(name, dirty, close);
    tabsHost.append(tab);
    tabRows.set(tabDocument.id, { element: tab, name, dirty, close });
  }
}

function updateTabRow(document: DocumentRecord): void {
  const row = tabRows.get(document.id);
  if (!row) {
    renderTabs();
    return;
  }
  const label = tabLabel(document);
  row.element.dataset["name"] = label;
  row.name.textContent = label;
  row.dirty.hidden = !document.dirty;
  row.close.setAttribute("aria-label", formatMessage("tab.close", { file: label }));
}

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
  renderTabs();
  showPreviewError();
  scheduler.schedule(true);
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
  const document = createDocumentRecord({
    canonicalPath: input.canonicalPath,
    grant: input.grant,
    name: input.name,
    replication,
    savedText: Text.of(input.savedText.split("\n")),
    state: createEditorState(input.text, documentState, callbacks),
  });
  registry.add(document);
  const version = replication.current();
  const text = document.state.doc.toString();
  renderWorker.postMessage({ op: "attach", ...version, text } satisfies RenderAttachMessage);
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

async function openReference(reference: DocumentReference): Promise<void> {
  const existing = registry.findByPath(reference.canonicalPath);
  if (existing) {
    activateDocument(existing);
    await releaseGrant(reference.grant);
    return;
  }
  const read = valueOrStatus(await readDocument(reference.grant), reference.name);
  if (!read) {
    await releaseGrant(reference.grant);
    return;
  }
  const raced = registry.findByPath(read.canonicalPath);
  if (raced) {
    activateDocument(raced);
    await releaseGrant(reference.grant);
    return;
  }
  const document = newDocument({
    canonicalPath: read.canonicalPath,
    grant: reference.grant,
    name: reference.name,
    savedText: read.text,
    text: read.text,
  });
  removePristineUntitled();
  activateDocument(document);
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

async function openDocument(): Promise<void> {
  try {
    const opened = valueOrStatus(await openFile());
    if (opened) {
      await openReference(opened);
    }
  } catch (error) {
    showUnexpectedError(error);
  }
}

async function openDroppedPath(filePath: string): Promise<void> {
  try {
    const opened = valueOrStatus(await openPath({ path: filePath }));
    if (opened) {
      await openReference(opened);
    }
  } catch (error) {
    showUnexpectedError(error);
  }
}

async function releaseGrant(grant: string): Promise<void> {
  valueOrStatus(await releaseDocument({ grant }));
}

function handleOpenRequest(request: Result<DocumentReference>): void {
  const opened = valueOrStatus(request);
  if (opened) {
    void openReference(opened).catch(showUnexpectedError);
  }
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
  dirtyFrame.forget(document.id);
  detachDocument({ docId: document.id });
  renderWorker.postMessage({ op: "detach", docId: document.id });
  drafts.documentSaved(document.id);
  clearDraft({ docId: document.id });
  if (document.grant) {
    void releaseGrant(document.grant);
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
      editor.setState(createEditorState("", documentState, callbacks));
      documentState.applyingDocument = false;
      documentState.currentGrant = null;
      documentState.currentName = null;
      documentState.saved = Text.empty;
      documentState.dirty = false;
      updateTitle();
      renderTabs();
    }
  } else {
    renderTabs();
  }
}

function askClosePrompt(documents: readonly DocumentRecord[]): Promise<CloseAnswer> {
  closePromptMessage.textContent = documents.length === 1
    ? closeFileMessage(documents[0]?.name ?? null)
    : closeDocumentsMessage(documents.map((document) => document.name));
  closePrompt.hidden = false;
  closePrompt.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.focus();
  return new Promise((resolve) => {
    closePromptResolve = resolve;
  });
}

function finishClosePrompt(answer: CloseAnswer): void {
  const resolve = closePromptResolve;
  closePromptResolve = null;
  closePrompt.hidden = true;
  resolve?.(answer);
}

closePrompt.addEventListener("click", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>("[data-action]")
    : null;
  const action = target?.dataset["action"];
  if (action === "cancel" || action === "discard" || action === "save") {
    finishClosePrompt(action);
  }
});

async function closeTab(document: DocumentRecord): Promise<void> {
  dirtyFrame.flush();
  if (document.dirty) {
    const answer = await askClosePrompt([document]);
    const resolution = resolveClosePrompt(true, answer);
    if (resolution === "cancel") {
      return;
    }
    if (resolution === "save" && !(await saveDocument(document, false))) {
      return;
    }
  }
  removeDocument(document);
}

interface SaveSnapshot {
  document: Text;
  version: ReplicatedVersion;
}

function markSaved(
  document: DocumentRecord,
  text: Text,
  version: number,
): void {
  markDocumentSaved(document, text, version);
  if (document.dirty) {
    drafts.documentChanged(document.id, document.state.doc.length);
  } else {
    drafts.documentSaved(document.id);
    clearDraft({ docId: document.id });
  }
  syncDirty(document);
}

async function saveSnapshot(
  document: DocumentRecord,
  snapshot: SaveSnapshot,
  grant: string,
  fileName: string | null,
): Promise<string | undefined> {
  const saved = valueOrStatus(
    await saveReplicatedDocument({
      grant,
      document: snapshot.document,
      version: snapshot.version,
      attach: attachDocument,
      save: saveDocumentVersion,
    }),
    fileName,
  );
  if (saved) {
    markSaved(document, snapshot.document, saved.version);
    showStatus();
    return saved.name;
  }
  return undefined;
}

async function saveToCurrentGrant(
  document: DocumentRecord,
  snapshot: SaveSnapshot,
  grant: string,
): Promise<boolean> {
  const name = await saveSnapshot(document, snapshot, grant, document.name);
  if (!name) {
    return false;
  }
  document.name = name;
  syncDirty(document);
  return true;
}

async function saveToNewGrant(
  document: DocumentRecord,
  snapshot: SaveSnapshot,
): Promise<boolean> {
  const target = valueOrStatus(await chooseSaveTarget({
    grant: document.grant,
  }));
  if (!target) {
    return false;
  }
  const name = await saveSnapshot(document, snapshot, target.grant, target.name);
  if (!name) {
    await releaseGrant(target.grant);
    return false;
  }
  const previousGrant = document.grant;
  document.grant = target.grant;
  document.name = name;
  registry.adoptPath(document.id, target.canonicalPath);
  syncDirty(document);
  if (previousGrant) {
    await releaseGrant(previousGrant);
  }
  return true;
}

async function saveDocument(
  document: DocumentRecord,
  saveAs: boolean,
): Promise<boolean> {
  const snapshot = {
    document: document.state.doc,
    version: document.replication.current(),
  };
  try {
    if (!saveAs && document.grant) {
      return await saveToCurrentGrant(document, snapshot, document.grant);
    }
    return await saveToNewGrant(document, snapshot);
  } catch (error) {
    showUnexpectedError(error);
    return false;
  }
}

async function saveActiveDocument(saveAs: boolean): Promise<void> {
  const document = activeDocument;
  if (document) {
    await saveDocument(document, saveAs);
  }
}

function sendDraft(docId: string): void {
  const document = registry.get(docId);
  if (!document || !document.dirty) {
    return;
  }
  const version = document.replication.current();
  void draftDocument({ grant: document.grant, ...version }).then((result) => {
    if (!result.ok && result.error.code !== "OUT_OF_SYNC") {
      valueOrStatus(result, document.name);
    }
  }).catch(showUnexpectedError);
}

function snapshotDocuments(): {
  grant: string;
  name: string;
  savedText: string;
  text: string;
}[] {
  return registry.all().flatMap((document) => {
    if (document.grant === null) {
      return [];
    }
    return [{
      grant: document.grant,
      name: tabLabel(document),
      savedText: document.saved.text.toString(),
      text: document.state.doc.toString(),
    }];
  });
}

async function handleSessionClose(request: SessionCloseRequest): Promise<void> {
  dirtyFrame.flush();
  const dirty = registry.all().filter((document) => document.dirty);
  let allow = true;
  if (dirty.length > 0) {
    const answer = await askClosePrompt(dirty);
    const resolution = resolveClosePrompt(true, answer);
    if (resolution === "cancel") {
      allow = false;
    } else if (resolution === "save") {
      for (const document of dirty) {
        if (!(await saveDocument(document, false))) {
          allow = false;
          break;
        }
      }
    }
  }
  // A clean close records unsaved text for hot exit: Discard skips the disk
  // write, it does not erase the document the next launch restores.
  const result = await respondSessionClose({
    allow,
    documents: allow ? snapshotDocuments() : [],
    id: request.id,
  });
  valueOrStatus(result);
}

async function recoverDrafts(): Promise<boolean> {
  const listed = await listDrafts();
  if (!listed.ok) {
    return false;
  }
  let recovered = false;
  for (const draft of listed.value.drafts) {
    recovered = (await recoverDraft(draft)) || recovered;
  }
  return recovered;
}

async function recoverDraft(draft: DraftDocument): Promise<boolean> {
  if (draft.grant === null) {
    const document = newDocument({
      canonicalPath: null,
      grant: null,
      name: null,
      savedText: "",
      text: draft.text,
    });
    removePristineUntitled();
    activateDocument(document);
    showStatus(formatMessage("draft.recovered", { file: "Untitled" }));
    return true;
  }
  const read = await readDocument(draft.grant);
  if (!read.ok || registry.findByPath(read.value.canonicalPath)) {
    return false;
  }
  const document = newDocument({
    canonicalPath: read.value.canonicalPath,
    grant: draft.grant,
    name: read.value.name,
    savedText: read.value.text,
    text: draft.text,
  });
  removePristineUntitled();
  activateDocument(document);
  showStatus(formatMessage("draft.recovered", { file: read.value.name }));
  return true;
}

async function restoreSession(): Promise<void> {
  const session = await loadSession();
  if (!session.ok) {
    return;
  }
  for (const stored of session.value.documents) {
    const read = await readDocument(stored.grant);
    if (!read.ok || registry.findByPath(read.value.canonicalPath)) {
      continue;
    }
    const document = newDocument({
      canonicalPath: read.value.canonicalPath,
      grant: stored.grant,
      name: read.value.name,
      savedText: stored.savedText,
      text: stored.text,
    });
    removePristineUntitled();
    activateDocument(document);
  }
}

onOpenRequest(handleOpenRequest);
onSessionCloseRequest((request) => {
  void handleSessionClose(request).catch(showUnexpectedError);
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});
window.addEventListener("drop", (event) => {
  event.preventDefault();
  for (const file of Array.from(event.dataTransfer?.files ?? [])) {
    const filePath = pathForFile(file);
    if (filePath) {
      void openDroppedPath(filePath);
    }
  }
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
  installWorkerHandlers();
  wireRenderWorker(workerProxy, {
    scheduler,
    preview,
    showStatus: showPreviewStatus,
    showError: showPreviewError,
    currentVersion: () => activeDocument?.replication.current() ?? {
      docId: "document-none",
      epoch: 0,
      version: 0,
    },
    onResync: resyncRenderWorker,
    rewriteHtml: (html) => rewriteAssetUrls(html, {
      windowId,
      grant: activeDocument?.grant ?? null,
    }),
  });
  wirePreviewLinks(preview, showStatus);
  heartbeat.start();
  scheduler.schedule();
  const untitled = createUntitled();
  activateDocument(untitled);
  updateTitle();
  try {
    const ready = valueOrStatus(await readyForOpenRequests());
    if (ready) {
      windowId = ready.windowId;
      documentState.productName = ready.productName;
      updateTitle();
      const recovered = await recoverDrafts();
      if (!recovered) {
        await restoreSession();
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
