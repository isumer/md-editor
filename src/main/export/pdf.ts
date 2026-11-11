import { randomUUID } from "node:crypto";

import { app, BrowserWindow, protocol, type WebContents } from "electron";

export interface PdfMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PdfExportRequest {
  html: string;
  pageSize: "A4" | "Letter";
  margins: PdfMargins;
  printBackground: boolean;
}

const PDF_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src doc-asset: data:";
const MAX_HTML_LENGTH = 256 * 1024 * 1024;
const DOCUMENT_SCHEME = "pdf-export";
const DOCUMENT_HOST = "document";

const documents = new Map<string, string>();

function documentFor(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== `${DOCUMENT_SCHEME}:` ||
      parsed.hostname !== DOCUMENT_HOST ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    const id = parsed.pathname.slice(1);
    return id === "" || id.includes("/") ? null : documents.get(id) ?? null;
  } catch {
    return null;
  }
}

function registerDocumentScheme(): void {
  if (protocol.isProtocolHandled(DOCUMENT_SCHEME)) {
    return;
  }
  protocol.handle(DOCUMENT_SCHEME, (request) => {
    const html = documentFor(request.url);
    return html === null
      ? new Response(null, { status: 404 })
      : new Response(html, {
        headers: {
          "content-security-policy": PDF_CSP,
          "content-type": "text/html; charset=utf-8",
        },
      });
  });
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))) {
      return null;
    }
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        return null;
      }
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function validMargin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

function validMargins(value: unknown): value is PdfMargins {
  const margins = exactObject(value, ["top", "bottom", "left", "right"]);
  return margins !== null && validMargin(margins["top"]) &&
    validMargin(margins["bottom"]) && validMargin(margins["left"]) &&
    validMargin(margins["right"]);
}

export function isPdfExportRequest(value: unknown): value is PdfExportRequest {
  const request = exactObject(
    value,
    ["html", "pageSize", "margins", "printBackground"],
  );
  return request !== null && typeof request["html"] === "string" &&
    request["html"].length <= MAX_HTML_LENGTH &&
    (request["pageSize"] === "A4" || request["pageSize"] === "Letter") &&
    validMargins(request["margins"]) && typeof request["printBackground"] === "boolean";
}

function secureHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PDF_CSP}">`;
  const withoutPolicy = html.replace(
    /<meta\b[^>]*\bhttp-equiv\s*=\s*(?:"content-security-policy"|'content-security-policy'|content-security-policy)[^>]*>/gi,
    "",
  );
  return /<head(?:\s[^>]*)?>/i.test(withoutPolicy)
    ? withoutPolicy.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${policy}`)
    : `<!doctype html><html><head>${policy}</head><body>${withoutPolicy}</body></html>`;
}

function denyNavigation(webContents: WebContents): void {
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

export async function createPdfBytes(value: unknown): Promise<Uint8Array> {
  if (!isPdfExportRequest(value)) {
    throw new Error("Invalid PDF export request");
  }
  registerDocumentScheme();
  const documentId = randomUUID();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  denyNavigation(window.webContents);
  documents.set(documentId, secureHtml(value.html));
  let destroyed = false;
  const destroyWindow = (): void => {
    if (!destroyed) {
      destroyed = true;
      window.destroy();
    }
  };
  app.once("before-quit", destroyWindow);
  try {
    await window.loadURL(`${DOCUMENT_SCHEME}://${DOCUMENT_HOST}/${documentId}`);
    const bytes = await window.webContents.printToPDF({
      pageSize: value.pageSize,
      margins: value.margins,
      printBackground: value.printBackground,
      preferCSSPageSize: false,
    });
    return new Uint8Array(bytes);
  } finally {
    app.removeListener("before-quit", destroyWindow);
    documents.delete(documentId);
    destroyWindow();
  }
}
