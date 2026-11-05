import type { Text } from "@codemirror/state";

import type { DocumentReference } from "../shared/ipc/file";
import type { Result } from "../shared/ipc/result";
import { formatMessage } from "../shared/messages/en";
import type {
  RenderAttachMessage,
  RenderRequest,
  RenderResync,
} from "../shared/workers/render";
import {
  createDocumentState,
  documentTitle,
  messageParams,
  settleDocumentReplacement,
} from "./core/document";
import {
  DocumentReplication,
  type ReplicatedVersion,
  saveReplicatedDocument,
} from "./core/replication";
import { createEditor } from "./editor/editor";
import {
  wirePreviewLinks,
  wireRenderWorker,
} from "./features/preview/preview";
import { RenderScheduler } from "./features/preview/renderScheduler";
import { rewriteAssetUrls } from "./features/preview/rewriteAssets";
import {
  attachDocument,
  chooseSaveTarget,
  detachDocument,
  onMenuCommand,
  onOpenRequest,
  openFile,
  readDocument,
  readyForOpenRequests,
  releaseDocument,
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

const editorHost = requiredElement<HTMLElement>("#editor");
const preview = requiredElement<HTMLElement>("#preview");
const status = requiredElement<HTMLElement>("#status");
const renderWorker = new Worker(
  new URL("./workers/render/render.worker.ts", import.meta.url),
  { type: "module" },
);
const documentState = createDocumentState();
const replication = new DocumentReplication();

let windowId: number | null = null;
let statusFromPreview = false;

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

function updateTitle(): void {
  document.title = documentTitle(documentState);
}

const scheduler = new RenderScheduler((request) => {
  renderWorker.postMessage({
    op: "render",
    id: request.id,
    ...replication.current(),
  } satisfies RenderRequest);
});

const editor = createEditor(
  editorHost,
  documentState,
  {
    onDocumentChanged: () => scheduler.schedule(),
    onChanges: (changes) => {
      const message = replication.changed(changes);
      sendChanges(message);
      renderWorker.postMessage(message);
    },
    updateTitle,
  },
);

function resyncRenderWorker(response: RenderResync): void {
  const current = replication.current();
  if (response.docId !== current.docId || response.epoch !== current.epoch ||
    response.version > current.version) {
    return;
  }
  renderWorker.postMessage({
    op: "attach",
    ...current,
    text: editor.state.doc.toString(),
  } satisfies RenderAttachMessage);
  scheduler.schedule();
}

wireRenderWorker(renderWorker, {
  scheduler,
  preview,
  showStatus: showPreviewStatus,
  currentVersion: () => replication.current(),
  onResync: resyncRenderWorker,
  rewriteHtml: (html) => rewriteAssetUrls(html, {
    windowId,
    grant: documentState.currentGrant,
  }),
});
wirePreviewLinks(preview, showStatus);

async function attachText(
  document: Text,
  version: ReplicatedVersion,
  fileName: string | null,
): Promise<void> {
  const message = { ...version, text: document.toString() };
  renderWorker.postMessage({ op: "attach", ...message } satisfies RenderAttachMessage);
  const result = await attachDocument(message);
  if (!result.ok) {
    valueOrStatus(result, fileName);
  }
}

async function displayDocument(
  documentFile: DocumentReference & { text: string },
): Promise<void> {
  const replaced = replication.replace();
  detachDocument({ docId: replaced.detachedDocId });
  renderWorker.postMessage({ op: "detach", docId: replaced.detachedDocId });
  documentState.applyingDocument = true;
  documentState.currentGrant = documentFile.grant;
  documentState.currentName = documentFile.name;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: documentFile.text },
    selection: { anchor: 0 },
  });
  documentState.applyingDocument = false;
  documentState.saved = editor.state.doc;
  documentState.dirty = false;
  updateTitle();
  scheduler.schedule();
  showStatus();
  editor.focus();
  await attachText(editor.state.doc, replaced.current, documentFile.name);
}

function valueOrStatus<T>(result: Result<T>, fileName: string | null = null): T | undefined {
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
      await loadDocument(opened);
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

async function releaseGrant(grant: string): Promise<void> {
  valueOrStatus(await releaseDocument({ grant }));
}

async function loadDocument(reference: DocumentReference): Promise<void> {
  const read = valueOrStatus(
    await readDocument(reference.grant),
    reference.name,
  );
  if (!read) {
    await releaseGrant(reference.grant);
    return;
  }
  const accepted = await settleDocumentReplacement({
    currentGrant: documentState.currentGrant,
    newGrant: reference.grant,
    dirty: documentState.dirty,
    confirmDiscard: () => window.confirm("Discard unsaved changes?"),
    release: releaseGrant,
  });
  if (accepted) {
    await displayDocument({ ...reference, text: read.text });
  }
}

function handleOpenRequest(request: Result<DocumentReference>): void {
  const opened = valueOrStatus(request);
  if (opened) {
    void loadDocument(opened).catch(showUnexpectedError);
  }
}

function showUnexpectedError(error: unknown): void {
  showStatus(error instanceof Error ? error.message : String(error));
}

function markSaved(document: Text): void {
  documentState.saved = document;
  documentState.dirty = !editor.state.doc.eq(document);
  updateTitle();
}

interface SaveSnapshot {
  document: Text;
  version: ReplicatedVersion;
}

async function saveSnapshot(
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
    markSaved(snapshot.document);
    showStatus();
    return saved.name;
  }
  return undefined;
}

async function saveToCurrentGrant(snapshot: SaveSnapshot, grant: string): Promise<void> {
  const name = await saveSnapshot(snapshot, grant, documentState.currentName);
  if (name) {
    documentState.currentName = name;
    updateTitle();
  }
}

async function saveToNewGrant(snapshot: SaveSnapshot): Promise<void> {
  const target = valueOrStatus(await chooseSaveTarget({
    grant: documentState.currentGrant,
  }));
  if (!target) {
    return;
  }
  const name = await saveSnapshot(snapshot, target.grant, target.name);
  if (!name) {
    await releaseGrant(target.grant);
    return;
  }
  const previousGrant = documentState.currentGrant;
  documentState.currentGrant = target.grant;
  documentState.currentName = name;
  updateTitle();
  if (previousGrant) {
    await releaseGrant(previousGrant);
  }
}

async function saveEditorDocument(saveAs: boolean): Promise<void> {
  const snapshot = {
    document: editor.state.doc,
    version: replication.current(),
  };
  try {
    const grant = documentState.currentGrant;
    if (!saveAs && grant) {
      await saveToCurrentGrant(snapshot, grant);
    } else {
      await saveToNewGrant(snapshot);
    }
  } catch (error) {
    showUnexpectedError(error);
  }
}

onMenuCommand((command) => {
  if (command === "open") {
    void openDocument();
  } else if (command === "save") {
    void saveEditorDocument(false);
  } else {
    void saveEditorDocument(true);
  }
});

onOpenRequest(handleOpenRequest);

async function initializeOpenRequests(): Promise<void> {
  scheduler.schedule();
  updateTitle();
  try {
    await attachText(editor.state.doc, replication.current(), null);
    const ready = valueOrStatus(await readyForOpenRequests());
    if (ready) {
      windowId = ready.windowId;
      documentState.productName = ready.productName;
      updateTitle();
      if (documentState.currentGrant) {
        scheduler.schedule();
      }
      if (ready.notice) {
        showStatus(ready.notice);
      }
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

void initializeOpenRequests();
