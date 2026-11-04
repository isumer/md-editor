import type { DocumentReference } from "../shared/ipc/file";
import type { Result } from "../shared/ipc/result";
import { formatMessage } from "../shared/messages/en";
import type { RenderRequest } from "../shared/workers/render";
import {
  createDocumentState,
  documentTitle,
  messageParams,
  settleDocumentReplacement,
} from "./core/document";
import { createEditor } from "./editor/editor";
import {
  wirePreviewLinks,
  wireRenderWorker,
} from "./features/preview/preview";
import { RenderScheduler } from "./features/preview/renderScheduler";
import {
  chooseSaveTarget,
  onMenuCommand,
  onOpenRequest,
  openFile,
  readDocument,
  readyForOpenRequests,
  releaseDocument,
  writeDocument,
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

function showStatus(message = ""): void {
  status.textContent = message;
}

function updateTitle(): void {
  document.title = documentTitle(documentState);
}

const scheduler = new RenderScheduler((request: RenderRequest) => {
  renderWorker.postMessage(request);
});

const editor = createEditor(
  editorHost,
  documentState,
  (text) => scheduler.schedule(text),
  updateTitle,
);

wireRenderWorker(renderWorker, scheduler, preview, showStatus);
wirePreviewLinks(preview, showStatus);

function displayDocument(documentFile: DocumentReference & { text: string }): void {
  documentState.applyingDocument = true;
  documentState.currentGrant = documentFile.grant;
  documentState.currentName = documentFile.name;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: documentFile.text },
    selection: { anchor: 0 },
  });
  documentState.applyingDocument = false;
  documentState.dirty = false;
  updateTitle();
  scheduler.schedule(documentFile.text);
  showStatus();
  editor.focus();
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
    displayDocument({ ...reference, text: read.text });
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

function markSavedIfCurrent(text: string): void {
  if (editor.state.doc.toString() === text) {
    documentState.dirty = false;
  }
  updateTitle();
}

async function saveToCurrentGrant(text: string, grant: string): Promise<void> {
  const saved = valueOrStatus(
    await writeDocument({ grant, text }),
    documentState.currentName,
  );
  if (saved) {
    documentState.currentName = saved.name;
    markSavedIfCurrent(text);
    showStatus();
  }
}

async function saveToNewGrant(text: string): Promise<void> {
  const target = valueOrStatus(await chooseSaveTarget({
    grant: documentState.currentGrant,
  }));
  if (!target) {
    return;
  }
  const saved = valueOrStatus(
    await writeDocument({ grant: target.grant, text }),
    target.name,
  );
  if (!saved) {
    await releaseGrant(target.grant);
    return;
  }
  const previousGrant = documentState.currentGrant;
  documentState.currentGrant = target.grant;
  documentState.currentName = saved.name;
  markSavedIfCurrent(text);
  showStatus();
  if (previousGrant) {
    await releaseGrant(previousGrant);
  }
}

async function saveDocument(saveAs: boolean): Promise<void> {
  const text = editor.state.doc.toString();
  try {
    const grant = documentState.currentGrant;
    if (!saveAs && grant) {
      await saveToCurrentGrant(text, grant);
    } else {
      await saveToNewGrant(text);
    }
  } catch (error) {
    showUnexpectedError(error);
  }
}

onMenuCommand((command) => {
  if (command === "open") {
    void openDocument();
  } else if (command === "save") {
    void saveDocument(false);
  } else {
    void saveDocument(true);
  }
});

onOpenRequest(handleOpenRequest);

async function initializeOpenRequests(): Promise<void> {
  scheduler.schedule(editor.state.doc.toString());
  updateTitle();
  try {
    const ready = valueOrStatus(await readyForOpenRequests());
    if (ready) {
      documentState.productName = ready.productName;
      updateTitle();
      if (ready.notice) {
        showStatus(ready.notice);
      }
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

void initializeOpenRequests();
