import type { OpenedFile, SavedFile } from "../shared/ipc/file";
import type { Result } from "../shared/ipc/result";
import { formatMessage } from "../shared/messages/en";
import type { RenderRequest } from "../shared/workers/render";
import { createDocumentState, documentTitle } from "./core/document";
import { createEditor } from "./editor/editor";
import {
  wirePreviewLinks,
  wireRenderWorker,
} from "./features/preview/preview";
import { RenderScheduler } from "./features/preview/renderScheduler";
import {
  onMenuCommand,
  onOpenRequest,
  openFile,
  readyForOpenRequests,
  saveFile,
  saveFileAs,
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

function displayDocument(documentFile: OpenedFile): void {
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

function valueOrStatus<T>(result: Result<T>): T | undefined {
  if (!result.ok) {
    showStatus(formatMessage(result.error.messageKey, result.error.params));
    return undefined;
  }
  return result.value;
}

async function openDocument(): Promise<void> {
  try {
    const opened = valueOrStatus(await openFile());
    if (opened && mayDiscardDirtyDocument()) {
      displayDocument(opened);
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

function mayDiscardDirtyDocument(): boolean {
  return !documentState.dirty || window.confirm("Discard unsaved changes?");
}

function handleOpenRequest(request: Result<OpenedFile>): void {
  const opened = valueOrStatus(request);
  if (opened && mayDiscardDirtyDocument()) {
    displayDocument(opened);
  }
}

async function saveDocument(saveAs: boolean): Promise<void> {
  const text = editor.state.doc.toString();
  try {
    const result = saveAs
      ? await saveFileAs({ grant: documentState.currentGrant, text })
      : await saveFile({ grant: documentState.currentGrant, text });
    const saved = valueOrStatus<SavedFile | null>(result);
    if (!saved) {
      return;
    }
    documentState.currentGrant = saved.grant;
    documentState.currentName = saved.name;
    if (editor.state.doc.toString() === text) {
      documentState.dirty = false;
    }
    updateTitle();
    showStatus();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
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
