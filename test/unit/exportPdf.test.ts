import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = [];
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    readonly webHandlers = new Map<string, (...args: unknown[]) => void>();
    readonly printToPDF = vi.fn(async () => Buffer.from("%PDF-1.7\n/Type /Page\n"));
    readonly loadURL = vi.fn(async (_url: string) => undefined);
    readonly destroy = vi.fn();
    readonly webContents = {
      on: vi.fn((name: string, handler: (...args: unknown[]) => void) => {
        this.webHandlers.set(name, handler);
      }),
      setWindowOpenHandler: vi.fn(),
      printToPDF: this.printToPDF,
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      BrowserWindowMock.instances.push(this);
    }
  }

  return { BrowserWindowMock };
});

vi.mock("electron", () => ({ BrowserWindow: electron.BrowserWindowMock }));

import {
  createPdfBytes,
  type PdfExportRequest,
} from "../../src/main/export/pdf";

function request(overrides: Partial<PdfExportRequest> = {}): PdfExportRequest {
  return {
    html: "<!doctype html><html><head></head><body><h1>Safe</h1></body></html>",
    pageSize: "A4",
    margins: { top: 0.5, bottom: 0.5, left: 0.25, right: 0.25 },
    printBackground: true,
    ...overrides,
  };
}

beforeEach(() => {
  electron.BrowserWindowMock.instances.length = 0;
  vi.clearAllMocks();
});

describe("PDF export", () => {
  it("AC-R6-04: sends A4, margin, and background options to Chromium", async () => {
    await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];

    expect(window?.printToPDF).toHaveBeenCalledWith({
      pageSize: "A4",
      margins: { top: 0.5, bottom: 0.5, left: 0.25, right: 0.25 },
      printBackground: true,
      preferCSSPageSize: false,
    });
  });

  it("AC-R6-04: sends Letter and disabled backgrounds to Chromium", async () => {
    await createPdfBytes(request({ pageSize: "Letter", printBackground: false }));
    const window = electron.BrowserWindowMock.instances[0];

    expect(window?.printToPDF).toHaveBeenCalledWith(expect.objectContaining({
      pageSize: "Letter",
      printBackground: false,
    }));
  });

  it("AC-SEC-15: isolates the PDF window and denies navigation", async () => {
    await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];
    const preferences = window?.options["webPreferences"];

    expect(window?.options).toMatchObject({ show: false, webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    } });
    expect(preferences).not.toHaveProperty("preload");
    expect(window?.webContents.setWindowOpenHandler).toHaveBeenCalled();
    const navigation = window?.webHandlers.get("will-navigate");
    const preventDefault = vi.fn();
    navigation?.({ preventDefault }, "https://example.com");
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("AC-SEC-15: replaces the HTML policy with the PDF resource policy", async () => {
    await createPdfBytes(request({
      html: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" ' +
        'content="default-src \'none\'; img-src \'self\'"></head><body></body></html>',
    }));
    const window = electron.BrowserWindowMock.instances[0];
    const loadedUrl = window?.loadURL.mock.calls[0]?.[0] as string | undefined;
    const loadedHtml = decodeURIComponent(loadedUrl?.split(",", 2)[1] ?? "");

    expect(loadedHtml).toContain("img-src doc-asset: data:");
    expect(loadedHtml).not.toContain("img-src 'self'");
  });

  it("AC-R6-03: returns PDF bytes and always destroys the hidden window", async () => {
    const bytes = await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(window?.destroy).toHaveBeenCalledOnce();
  });

  it("AC-SEC-07: rejects malformed PDF requests before it creates a window", async () => {
    await expect(createPdfBytes({ ...request(), pageSize: "Legal" })).rejects.toThrow(
      "Invalid PDF export request",
    );

    expect(electron.BrowserWindowMock.instances).toHaveLength(0);
  });
});
