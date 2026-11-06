import { BrowserWindow, type WebContents } from "electron";

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
  try {
    const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(secureHtml(value.html))}`;
    await window.loadURL(documentUrl);
    const bytes = await window.webContents.printToPDF({
      pageSize: value.pageSize,
      margins: value.margins,
      printBackground: value.printBackground,
      preferCSSPageSize: false,
    });
    return new Uint8Array(bytes);
  } finally {
    window.destroy();
  }
}
