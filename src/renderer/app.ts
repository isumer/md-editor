import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { IpcResult, OpenedFile, SavedFile } from "../shared/api";
import type { RenderRequest, RenderResponse } from "./render.worker";
import { RenderScheduler } from "./renderScheduler";
import { sanitizeRenderedHtml } from "./sanitize";
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
const renderWorker = new Worker(new URL("./render.worker.ts", import.meta.url), {
  type: "module",
});

let currentPath: string | null = null;
let dirty = false;
let applyingDocument = false;

function showStatus(message = ""): void {
  status.textContent = message;
}

function updateTitle(): void {
  const name = currentPath
    ? (currentPath.split(/[\\/]/).pop() ?? currentPath)
    : "Untitled";
  document.title = `${dirty ? "• " : ""}${name} — MD Editor`;
}

const scheduler = new RenderScheduler((request: RenderRequest) => {
  renderWorker.postMessage(request);
});

const editor = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) {
          return;
        }
        if (!applyingDocument) {
          dirty = true;
          updateTitle();
        }
        scheduler.schedule(update.state.doc.toString());
      }),
    ],
  }),
});

renderWorker.onmessage = (event: MessageEvent<RenderResponse>) => {
  const response = event.data;
  scheduler.applyResult(response.id, response, (appliedResponse) => {
    if (appliedResponse.ok) {
      preview.innerHTML = sanitizeRenderedHtml(appliedResponse.html);
      showStatus();
    } else {
      showStatus(appliedResponse.message);
    }
  });
};

renderWorker.onerror = (event) => {
  showStatus(event.message || "The preview worker failed");
};

function handlePreviewLink(event: MouseEvent): void {
  if (event.type === "auxclick" && event.button !== 1) {
    return;
  }
  const link = event.target instanceof Element
    ? event.target.closest<HTMLAnchorElement>("a[href]")
    : null;
  const href = link?.getAttribute("href");
  if (!href) {
    return;
  }

  event.preventDefault();
  if (href.startsWith("#")) {
    if (href === "#") {
      preview.scrollTo({ top: 0 });
      return;
    }

    let id: string;
    try {
      id = decodeURIComponent(href.slice(1));
    } catch {
      return;
    }
    const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]"))
      .find((element) => element.id === id);
    target?.scrollIntoView();
    return;
  }

  let protocol: string;
  try {
    protocol = new URL(href).protocol;
  } catch {
    showStatus(`Cannot open link: ${href}`);
    return;
  }
  if (protocol !== "http:" && protocol !== "https:" && protocol !== "mailto:") {
    showStatus(`Cannot open link: ${href}`);
    return;
  }

  void window.mdApi.openExternal(href).then((result) => {
    if (!result.ok) {
      showStatus(result.message);
    }
  }).catch((error) => {
    showStatus(error instanceof Error ? error.message : String(error));
  });
}

preview.addEventListener("click", handlePreviewLink);
preview.addEventListener("auxclick", handlePreviewLink);

function displayDocument(documentFile: OpenedFile): void {
  applyingDocument = true;
  currentPath = documentFile.path;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: documentFile.text },
    selection: { anchor: 0 },
  });
  applyingDocument = false;
  dirty = false;
  updateTitle();
  scheduler.schedule(documentFile.text);
  showStatus();
  editor.focus();
}

function valueOrStatus<T>(result: IpcResult<T>): T | undefined {
  if (!result.ok) {
    showStatus(result.message);
    return undefined;
  }
  return result.value;
}

async function openDocument(): Promise<void> {
  try {
    const opened = valueOrStatus(await window.mdApi.openFile());
    if (opened) {
      displayDocument(opened);
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

async function saveDocument(saveAs: boolean): Promise<void> {
  const text = editor.state.doc.toString();
  try {
    const result = saveAs
      ? await window.mdApi.saveFileAs({ path: currentPath, text })
      : await window.mdApi.saveFile({ path: currentPath, text });
    const saved = valueOrStatus<SavedFile | null>(result);
    if (!saved) {
      return;
    }
    currentPath = saved.path;
    if (editor.state.doc.toString() === text) {
      dirty = false;
    }
    updateTitle();
    showStatus();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

window.mdApi.onMenuCommand((command) => {
  if (command === "open") {
    void openDocument();
  } else if (command === "save") {
    void saveDocument(false);
  } else {
    void saveDocument(true);
  }
});

async function loadInitialDocument(): Promise<void> {
  try {
    const opened = valueOrStatus(await window.mdApi.getInitialFile());
    if (opened) {
      displayDocument(opened);
    } else {
      scheduler.schedule(editor.state.doc.toString());
      updateTitle();
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error));
  }
}

void loadInitialDocument();
