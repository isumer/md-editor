import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  type ProtocolHandler = (request: { url: string }) => Response | Promise<Response>;
  const protocolState = {
    handlers: new Map<string, ProtocolHandler>(),
    isProtocolHandled: vi.fn((scheme: string) => protocolState.handlers.has(scheme)),
    handle: vi.fn((scheme: string, handler: ProtocolHandler) => {
      protocolState.handlers.set(scheme, handler);
    }),
  };

  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = [];
    static printError: Error | null = null;
    readonly options: Record<string, unknown>;
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    readonly webHandlers = new Map<string, (...args: unknown[]) => void>();
    readonly printToPDF = vi.fn(async () => {
      if (BrowserWindowMock.printError) {
        throw BrowserWindowMock.printError;
      }
      return Buffer.from("%PDF-1.7\n/Type /Page\n");
    });
    readonly loadURL = vi.fn(async (url: string) => {
      const scheme = new URL(url).protocol.replace(/:$/, "");
      const handler = protocolState.handlers.get(scheme);
      if (!handler) {
        throw new Error(`No protocol handler for ${scheme}`);
      }
      const response = await handler({ url });
      if (!response.ok) {
        throw new Error(`Load failed with ${String(response.status)}`);
      }
      this.loadedPolicy = response.headers.get("content-security-policy");
      this.loadedHtml = await response.text();
    });
    loadedHtml = "";
    loadedPolicy: string | null = null;
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

  return { BrowserWindowMock, protocolState };
});

vi.mock("electron", () => ({
  BrowserWindow: electron.BrowserWindowMock,
  protocol: electron.protocolState,
}));

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
  electron.BrowserWindowMock.printError = null;
  electron.protocolState.handlers.clear();
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

    expect(window?.loadedHtml).toContain("img-src doc-asset: data:");
    expect(window?.loadedHtml).not.toContain("img-src 'self'");
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

  it("AC-SEC-07: rejects non-objects, extra keys and accessor margins", async () => {
    expect(await createPdfBytes(null).catch((error: unknown) => error))
      .toBeInstanceOf(Error);
    expect(await createPdfBytes({ ...request(), extra: true }).catch((error: unknown) => error))
      .toBeInstanceOf(Error);
    expect(await createPdfBytes(request({
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.25,
        get right() {
          return 0.25;
        },
      },
    })).catch((error: unknown) => error)).toBeInstanceOf(Error);

    expect(electron.BrowserWindowMock.instances).toHaveLength(0);
  });

  it("AC-SEC-07: accepts margins from 0 to 10 inches and rejects others", async () => {
    const margins = { top: 0.5, bottom: 0.5, left: 0.25, right: 0.25 };
    await createPdfBytes(request({ margins: { ...margins, top: 0, right: 10 } }));
    for (const bad of [-0.01, 10.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(createPdfBytes(request({ margins: { ...margins, left: bad } })))
        .rejects.toThrow("Invalid PDF export request");
    }

    expect(electron.BrowserWindowMock.instances).toHaveLength(1);
  });

  it("AC-SEC-07: rejects a request whose own keys cannot be read", async () => {
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("no keys");
      },
    });

    await expect(createPdfBytes(hostile)).rejects.toThrow("Invalid PDF export request");
    expect(electron.BrowserWindowMock.instances).toHaveLength(0);
  });

  it("AC-SEC-15: denies window.open from the hidden PDF page", async () => {
    await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];
    const handler = window?.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      (() => unknown) | undefined;

    expect(handler?.()).toEqual({ action: "deny" });
  });

  it("AC-SEC-15: wraps HTML that has no head element in the PDF policy", async () => {
    await createPdfBytes(request({ html: "<p>Plain body</p>" }));
    const window = electron.BrowserWindowMock.instances[0];

    expect(window?.loadedHtml).toContain("<!doctype html><html><head>");
    expect(window?.loadedHtml).toContain("default-src 'none'");
    expect(window?.loadedHtml).toContain("<body><p>Plain body</p></body>");
  });

  it("AC-R6-03: loads the document from an in-memory scheme, not a data URL", async () => {
    await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];
    const loadedUrl = window?.loadURL.mock.calls[0]?.[0] as string;

    expect(loadedUrl.startsWith("data:")).toBe(false);
    expect(loadedUrl).toMatch(/^pdf-export:\/\/document\/[0-9a-f-]{36}$/);
    expect(window?.loadedHtml).toContain("<h1>Safe</h1>");
  });

  it("AC-R6-03: registers the document scheme only once", async () => {
    await createPdfBytes(request());
    await createPdfBytes(request());

    expect(electron.protocolState.handle).toHaveBeenCalledOnce();
  });

  it("AC-R6-03: serves the document only while it is registered", async () => {
    await createPdfBytes(request());
    const window = electron.BrowserWindowMock.instances[0];
    const loadedUrl = window?.loadURL.mock.calls[0]?.[0] as string;
    const handler = electron.protocolState.handlers.get("pdf-export");

    const removed = await handler?.({ url: loadedUrl });
    const unknown = await handler?.({ url: "pdf-export://document/not-a-document" });

    expect(removed?.status).toBe(404);
    expect(unknown?.status).toBe(404);
  });

  it("AC-SEC-15: serves the document with the PDF policy as a response header", async () => {
    await createPdfBytes(request({ html: "<p>No head</p>" }));
    const window = electron.BrowserWindowMock.instances[0];

    expect(window?.loadedPolicy)
      .toBe("default-src 'none'; style-src 'unsafe-inline'; img-src doc-asset: data:");
  });

  it("AC-SEC-15: rejects document URLs outside the registered shape", async () => {
    await createPdfBytes(request());
    const handler = electron.protocolState.handlers.get("pdf-export");

    for (const url of [
      "not a url",
      "pdf-export://other/1",
      "pdf-export://document/",
      "pdf-export://document/a/b",
      "pdf-export://document/1?x=1",
      "pdf-export://document/1#x",
    ]) {
      const response = await handler?.({ url });
      expect(response?.status).toBe(404);
    }
  });

  it("AC-R6-03: destroys the hidden window when printing fails", async () => {
    electron.BrowserWindowMock.printError = new Error("print failed");

    await expect(createPdfBytes(request())).rejects.toThrow("print failed");
    const window = electron.BrowserWindowMock.instances[0];
    expect(window?.destroy).toHaveBeenCalledOnce();
  });
});
