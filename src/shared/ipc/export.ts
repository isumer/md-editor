export const EXPORT_CHANNEL = "export:document";

export interface PdfOptions {
  pageSize: "A4" | "Letter";
  margins: { top: number; bottom: number; left: number; right: number };
  printBackground: boolean;
}

export type ExportDocumentRequest =
  | { format: "html"; html: string; suggestedName: string }
  | { format: "pdf"; html: string; suggestedName: string; options: PdfOptions };

const MAX_HTML_LENGTH = 256 * 1024 * 1024;

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== keys.length || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))) return null;
    const record: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function validHtml(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_HTML_LENGTH;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    !/[\\/\u0000-\u001f]/.test(value);
}

function validMargin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

function validOptions(value: unknown): value is PdfOptions {
  const options = exact(value, ["pageSize", "margins", "printBackground"]);
  const margins = options ? exact(options["margins"], ["top", "bottom", "left", "right"]) : null;
  return options !== null && (options["pageSize"] === "A4" || options["pageSize"] === "Letter") &&
    margins !== null && validMargin(margins["top"]) && validMargin(margins["bottom"]) &&
    validMargin(margins["left"]) && validMargin(margins["right"]) &&
    typeof options["printBackground"] === "boolean";
}

export function isExportDocumentRequest(value: unknown): value is ExportDocumentRequest {
  let format: unknown;
  try {
    format = typeof value === "object" && value !== null
      ? Object.getOwnPropertyDescriptor(value, "format")?.value
      : undefined;
  } catch {
    return false;
  }
  const request = format === "html"
    ? exact(value, ["format", "html", "suggestedName"])
    : exact(value, ["format", "html", "suggestedName", "options"]);
  return request !== null && validHtml(request["html"]) && validName(request["suggestedName"]) &&
    (request["format"] === "html" ||
      (request["format"] === "pdf" && validOptions(request["options"])));
}

export const exportContract = {
  channel: EXPORT_CHANNEL,
  validate: isExportDocumentRequest,
} as const;
