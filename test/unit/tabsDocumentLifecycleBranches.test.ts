// @vitest-environment jsdom

import { EditorState, Text } from "@codemirror/state";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDocumentRecord, type DocumentRecord } from "../../src/renderer/core/document";
import { DocumentRegistry } from "../../src/renderer/core/documentRegistry";
import { DraftScheduler } from "../../src/renderer/core/draftScheduler";
import { DocumentReplication } from "../../src/renderer/core/replication";
import { DocumentClosePrompt } from "../../src/renderer/tabs/closePrompt";

const ok = <T>(value: T) => ({ ok: true, value } as const);
const failed = {
  ok: false,
  error: { code: "UNKNOWN", messageKey: "file.unknown", params: {}, retryable: false },
} as const;
const api = {
  attachDocument: vi.fn(async () => ok(undefined)),
  chooseSaveTarget: vi.fn<Window["api"]["chooseSaveTarget"]>(async () => ok(null)),
  clearDraft: vi.fn(),
  contributeMenu: vi.fn(async () => ok(undefined)),
  detachDocument: vi.fn(),
  draftDocument: vi.fn<Window["api"]["draftDocument"]>(async () => ok(undefined)),
  listDrafts: vi.fn<Window["api"]["listDrafts"]>(async () => ok({ drafts: [] })),
  loadSession: vi.fn<Window["api"]["loadSession"]>(async () => ok({ documents: [] })),
  onMenuCommand: vi.fn(() => vi.fn()),
  onOpenRequest: vi.fn(() => vi.fn()),
  onSessionCloseRequest: vi.fn(() => vi.fn()),
  openExternal: vi.fn(async () => ok(undefined)),
  openFile: vi.fn<Window["api"]["openFile"]>(async () => ok(null)),
  readDocument: vi.fn<Window["api"]["readDocument"]>(async () => failed),
  readyForOpenRequests: vi.fn(async () => ok({ notice: null, productName: "Editor", windowId: 1 })),
  releaseDocument: vi.fn(async () => ok(undefined)),
  respondSessionClose: vi.fn<Window["api"]["respondSessionClose"]>(async () => ok(undefined)),
  saveDocument: vi.fn<Window["api"]["saveDocument"]>(
    async () => ok({ name: "saved.md", version: 0 }),
  ),
  sendChanges: vi.fn(),
};

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: api as unknown as Window["api"],
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  api.openFile.mockResolvedValue(ok(null));
  api.chooseSaveTarget.mockResolvedValue(ok(null));
  api.draftDocument.mockResolvedValue(ok(undefined));
  api.listDrafts.mockResolvedValue(ok({ drafts: [] }));
  api.loadSession.mockResolvedValue(ok({ documents: [] }));
  api.readDocument.mockResolvedValue(failed);
  api.saveDocument.mockResolvedValue(ok({ name: "saved.md", version: 0 }));
});

function record(grant: string | null, text = "saved"): DocumentRecord {
  return createDocumentRecord({
    grant,
    name: grant ? `${grant}.md` : null,
    replication: new DocumentReplication(),
    savedText: Text.of(["saved"]),
    state: EditorState.create({ doc: text }),
  });
}

function fixture(initial: readonly DocumentRecord[] = []) {
  const registry = new DocumentRegistry();
  for (const item of initial) registry.add(item);
  const host = document.createElement("div");
  const message = document.createElement("p");
  host.append(message);
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = document.createElement("button");
    button.dataset["action"] = action;
    host.append(button);
  }
  const showStatus = vi.fn();
  return {
    host,
    options: {
      active: () => initial[0] ?? null,
      activate: vi.fn(),
      drafts: new DraftScheduler({ onDraft: vi.fn() }),
      flushDirty: vi.fn(),
      newDocument: (input: {
        canonicalPath: string | null; grant: string | null; name: string | null;
        savedText: string; text: string;
      }) => {
        const item = record(input.grant, input.text);
        item.canonicalPath = input.canonicalPath;
        item.name = input.name;
        registry.add(item);
        return item;
      },
      prompt: new DocumentClosePrompt(host, message),
      registry,
      remove: vi.fn(),
      removePristineUntitled: vi.fn(),
      showStatus,
      syncDirty: vi.fn(),
    },
    showStatus,
  };
}

describe("document lifecycle branches", () => {
  it("AC-R5-01: cancelled opens and failed open results keep the active document", async () => {
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture();
    const lifecycle = new DocumentLifecycle(context.options);

    await lifecycle.open();
    lifecycle.handleOpenRequest(failed);
    await lifecycle.saveActive(false);

    expect(context.options.activate).not.toHaveBeenCalled();
    expect(context.showStatus).toHaveBeenCalledOnce();
  });

  it("AC-R4-07: successful and out-of-sync drafts do not show errors", async () => {
    const dirty = record("one", "changed");
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([dirty]);
    const lifecycle = new DocumentLifecycle(context.options);
    lifecycle.sendDraft(dirty.id);
    api.draftDocument.mockResolvedValueOnce({
      ok: false,
      error: { code: "OUT_OF_SYNC", messageKey: "file.outOfSync", params: {}, retryable: true },
    });
    lifecycle.sendDraft(dirty.id);
    await vi.waitFor(() => expect(api.draftDocument).toHaveBeenCalledTimes(2));

    expect(context.showStatus).not.toHaveBeenCalled();
  });

  it("AC-R4-07: recovery skips unreadable drafts before recovering an untitled draft", async () => {
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture();
    api.listDrafts.mockResolvedValue(ok({ drafts: [
      { docId: "bad", grant: "bad", text: "bad" },
      { docId: "good", grant: null, text: "good" },
    ] }));

    await expect(new DocumentLifecycle(context.options).recover()).resolves.toBe(true);
    expect(context.options.registry.all()).toHaveLength(1);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "bad" });
  });

  it("AC-R5-03: save-as cancellation keeps the document unchanged", async () => {
    const untitled = record(null, "changed");
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([untitled]);

    await expect(new DocumentLifecycle(context.options).save(untitled, true))
      .resolves.toBe(false);
    expect(api.saveDocument).not.toHaveBeenCalled();
  });

  it("AC-R5-03: saving untitled content adopts a path without releasing a grant", async () => {
    const untitled = record(null, "changed");
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([untitled]);
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/new.md", grant: "new", name: "new.md",
    }));

    await expect(new DocumentLifecycle(context.options).save(untitled, true))
      .resolves.toBe(true);
    expect(api.releaseDocument).not.toHaveBeenCalled();
  });

  it("AC-R4-06: discard closes dirty sessions without saving", async () => {
    const dirty = record("one", "changed");
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([dirty]);
    const closing = new DocumentLifecycle(context.options).handleSessionClose({ id: 8 });
    context.host.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await closing;

    expect(api.saveDocument).not.toHaveBeenCalled();
    expect(api.respondSessionClose).toHaveBeenCalledWith(expect.objectContaining({ allow: true }));
  });
});
