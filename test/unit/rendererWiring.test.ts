// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentReference, OpenRequestReady } from "../../src/shared/ipc/file";
import type { Result } from "../../src/shared/ipc/result";
import type { SessionCloseRequest } from "../../src/shared/ipc/session";
import { formatMessage } from "../../src/renderer/core/messages";
import { rendererElements } from "../../src/renderer/platform/dom";
import { startRenderer, wireWindow } from "../../src/renderer/startup";
import { createStatusSurface } from "../../src/renderer/status";

function ready(overrides: Partial<OpenRequestReady> = {}): Result<OpenRequestReady> {
  return {
    ok: true,
    value: { notice: null, productName: "SolidMD", windowId: 1, ...overrides },
  };
}

function unwrap<T>(result: Result<T>): T | undefined {
  return result.ok ? result.value : undefined;
}

function errorResult(): Result<never> {
  return {
    ok: false,
    error: {
      code: "UNKNOWN",
      messageKey: "file.unknown",
      params: {},
      retryable: false,
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.cssText = "";
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.clearAllMocks();
});

describe("rendererElements", () => {
  it("returns every required element by its id", () => {
    document.body.innerHTML = `
      <div id="editor"></div>
      <div id="workspace"></div>
      <div id="preview"></div>
      <div id="preview-error"></div>
      <div id="status"></div>
      <div id="tabs"></div>
      <div id="close-prompt"></div>
      <div id="close-prompt-message"></div>
    `;
    const elements = rendererElements();
    expect(elements.editorHost.id).toBe("editor");
    expect(elements.workspace.id).toBe("workspace");
    expect(elements.preview.id).toBe("preview");
    expect(elements.previewError.id).toBe("preview-error");
    expect(elements.status.id).toBe("status");
    expect(elements.tabsHost.id).toBe("tabs");
    expect(elements.closePrompt.id).toBe("close-prompt");
    expect(elements.closePromptMessage.id).toBe("close-prompt-message");
  });

  it("throws the missing selector when an element is absent", () => {
    document.body.innerHTML = '<div id="editor"></div>';
    expect(() => rendererElements()).toThrow("Missing required element: #workspace");
  });
});

describe("createStatusSurface", () => {
  it("writes the status line and clears the preview ownership flag", () => {
    const status = document.createElement("div");
    const previewError = document.createElement("div");
    const surface = createStatusSurface(status, previewError);

    surface.showPreview("preview warning");
    surface.show("save failed");
    surface.showPreview("");

    expect(status.textContent).toBe("save failed");
    expect(previewError.textContent).toBe("");
  });

  it("clears only the preview's own status message", () => {
    const status = document.createElement("div");
    const surface = createStatusSurface(status, document.createElement("div"));

    surface.showPreview("preview warning");
    surface.showPreview("");

    expect(status.textContent).toBe("");
  });

  it("shows and hides the preview error text", () => {
    const previewError = document.createElement("div");
    const surface = createStatusSurface(document.createElement("div"), previewError);

    surface.showPreviewError("render failed");
    expect(previewError.textContent).toBe("render failed");
    expect(previewError.hidden).toBe(false);

    surface.showPreviewError();
    expect(previewError.textContent).toBe("");
    expect(previewError.hidden).toBe(true);
  });

  it("returns the value of a successful result", () => {
    const surface = createStatusSurface(
      document.createElement("div"),
      document.createElement("div"),
    );
    expect(surface.valueOrStatus({ ok: true, value: 7 })).toBe(7);
  });

  it("reports a failed result against the named file", () => {
    const status = document.createElement("div");
    const surface = createStatusSurface(status, document.createElement("div"));

    const value = surface.valueOrStatus(errorResult(), "notes.md");

    expect(value).toBeUndefined();
    expect(status.textContent).toBe(
      formatMessage("file.unknown", { file: "notes.md" }),
    );
  });

  it("uses Untitled when a failed result has no file name", () => {
    const status = document.createElement("div");
    const surface = createStatusSurface(status, document.createElement("div"));

    surface.valueOrStatus(errorResult());

    expect(status.textContent).toBe(
      formatMessage("file.unknown", { file: "Untitled" }),
    );
  });

  it("formats Error and non-Error failures for the status line", () => {
    const status = document.createElement("div");
    const surface = createStatusSurface(status, document.createElement("div"));

    surface.unexpected(new Error("boom"));
    expect(status.textContent).toBe("boom");

    surface.unexpected("plain failure");
    expect(status.textContent).toBe("plain failure");
  });
});

interface StartupFixture {
  boundary: Parameters<typeof startRenderer>[0];
  closePrompt: HTMLElement;
  apply: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  startRender: ReturnType<typeof vi.fn>;
  startFeatures: ReturnType<typeof vi.fn>;
  recover: ReturnType<typeof vi.fn>;
  restoreSession: ReturnType<typeof vi.fn>;
  openInitialDocument: ReturnType<typeof vi.fn>;
  onReady: ReturnType<typeof vi.fn>;
  showStatus: ReturnType<typeof vi.fn>;
  showError: ReturnType<typeof vi.fn>;
}

function startupFixture(
  requestReady: () => Promise<Result<OpenRequestReady>> = async () => ready(),
): StartupFixture {
  document.body.innerHTML = `
    <div id="close-prompt">
      <button data-action="cancel"></button>
      <button data-action="discard"></button>
      <button data-action="save"></button>
    </div>
  `;
  const closePrompt = document.querySelector<HTMLElement>("#close-prompt");
  if (!closePrompt) {
    throw new Error("close prompt fixture is missing");
  }
  const apply = vi.fn();
  const load = vi.fn(async () => undefined);
  const startRender = vi.fn();
  const startFeatures = vi.fn();
  const recover = vi.fn(async () => true);
  const restoreSession = vi.fn(async () => undefined);
  const openInitialDocument = vi.fn();
  const onReady = vi.fn();
  const showStatus = vi.fn();
  const showError = vi.fn();
  return {
    boundary: {
      closePrompt,
      settings: { apply, load },
      render: { start: startRender },
      features: { start: startFeatures },
      lifecycle: { recover, restoreSession },
      openInitialDocument,
      requestOpenRequests: requestReady,
      unwrap,
      onReady,
      showStatus,
      showError,
    },
    closePrompt,
    apply,
    load,
    startRender,
    startFeatures,
    recover,
    restoreSession,
    openInitialDocument,
    onReady,
    showStatus,
    showError,
  };
}

describe("startRenderer", () => {
  it("starts the surfaces, labels the close prompt and opens the first document", async () => {
    const fixture = startupFixture();

    await startRenderer(fixture.boundary);

    expect(fixture.openInitialDocument).toHaveBeenCalledOnce();
    expect(fixture.apply).toHaveBeenCalledOnce();
    expect(fixture.startRender).toHaveBeenCalledOnce();
    expect(fixture.startFeatures).toHaveBeenCalledOnce();
    expect(fixture.load).toHaveBeenCalledOnce();
    expect(fixture.onReady).toHaveBeenCalledWith({
      notice: null,
      productName: "SolidMD",
      windowId: 1,
    });
    expect(fixture.recover).toHaveBeenCalledOnce();
    expect(fixture.restoreSession).not.toHaveBeenCalled();
    const labels = Array.from(
      fixture.closePrompt.querySelectorAll("button"),
      (button) => button.textContent,
    );
    expect(labels).toEqual([
      formatMessage("close.cancel", {}),
      formatMessage("close.discard", {}),
      formatMessage("close.save", {}),
    ]);
  });

  it("keeps a missing close button from stopping startup", async () => {
    const fixture = startupFixture();
    fixture.closePrompt.querySelector('[data-action="save"]')?.remove();

    await startRenderer(fixture.boundary);

    expect(fixture.startRender).toHaveBeenCalledOnce();
  });

  it("restores the saved session when recovery finds no drafts", async () => {
    const fixture = startupFixture();
    fixture.recover.mockResolvedValue(false);

    await startRenderer(fixture.boundary);

    expect(fixture.restoreSession).toHaveBeenCalledOnce();
  });

  it("shows the ready notice after the session is restored", async () => {
    const fixture = startupFixture(async () => ready({ notice: "Drafts recovered" }));

    await startRenderer(fixture.boundary);

    expect(fixture.showStatus).toHaveBeenCalledWith("Drafts recovered");
  });

  it("stops when the ready result cannot be unwrapped", async () => {
    const fixture = startupFixture(async () => ({ ok: false, error: {
      code: "UNKNOWN",
      messageKey: "file.unknown",
      params: {},
      retryable: false,
    } }));

    await startRenderer(fixture.boundary);

    expect(fixture.onReady).not.toHaveBeenCalled();
    expect(fixture.recover).not.toHaveBeenCalled();
  });

  it("reports a rejected ready request", async () => {
    const fixture = startupFixture(async () => Promise.reject(new Error("ipc down")));

    await startRenderer(fixture.boundary);

    expect(fixture.showStatus).toHaveBeenCalledWith("ipc down");
  });

  it("reports a non-Error ready rejection", async () => {
    const fixture = startupFixture(async () => Promise.reject("ipc down"));

    await startRenderer(fixture.boundary);

    expect(fixture.showStatus).toHaveBeenCalledWith("ipc down");
  });
});

describe("wireWindow", () => {
  it("forwards open and close requests to the document lifecycle", async () => {
    let openListener: ((request: Result<DocumentReference>) => void) | undefined;
    let closeListener: ((request: SessionCloseRequest) => void) | undefined;
    const open = vi.fn((listener: (request: Result<DocumentReference>) => void) => {
      openListener = listener;
      return () => undefined;
    });
    const close = vi.fn((listener: (request: SessionCloseRequest) => void) => {
      closeListener = listener;
      return () => undefined;
    });
    const handleOpenRequest = vi.fn();
    const handleSessionClose = vi.fn(async () => undefined);
    const showError = vi.fn();

    wireWindow({ handleOpenRequest, handleSessionClose }, showError, { open, close });
    openListener?.({
      ok: true,
      value: { canonicalPath: "/notes.md", grant: "grant-a", name: "notes.md" },
    });
    closeListener?.({} as SessionCloseRequest);

    expect(handleOpenRequest).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(handleSessionClose).toHaveBeenCalledOnce());
  });

  it("reports a rejected session-close request", async () => {
    let closeListener: ((request: SessionCloseRequest) => void) | undefined;
    const failure = new Error("close failed");
    const showError = vi.fn();
    wireWindow(
      {
        handleOpenRequest: vi.fn(),
        handleSessionClose: vi.fn(async () => Promise.reject(failure)),
      },
      showError,
      {
        open: vi.fn(() => () => undefined),
        close: vi.fn((listener: (request: SessionCloseRequest) => void) => {
          closeListener = listener;
          return () => undefined;
        }),
      },
    );

    closeListener?.({} as SessionCloseRequest);

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith(failure));
  });

  it("prevents the window from opening dropped files", () => {
    wireWindow(
      { handleOpenRequest: vi.fn(), handleSessionClose: vi.fn(async () => undefined) },
      vi.fn(),
      {
        open: vi.fn(() => () => undefined),
        close: vi.fn(() => () => undefined),
      },
    );
    const dragOver = new Event("dragover", { cancelable: true });
    const drop = new Event("drop", { cancelable: true });

    window.dispatchEvent(dragOver);
    window.dispatchEvent(drop);

    expect(dragOver.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
  });
});
